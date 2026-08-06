// ── APC (Article Processing Charge) invoicing bot ────────
// On ACCEPTED, creates (or reuses) a Stripe Customer for the submission's
// author and sends a Stripe Invoice for the publication's configured APC
// amount. collection_method 'send_invoice' — the author gets an emailed
// payment link rather than needing a card already on file, which matches
// how first-time authors actually pay.
//
// From here Stripe owns collection: hosted payment page, receipts, and
// reminder emails (Smart Retries / dunning — configured once in the Stripe
// Dashboard under Settings → Billing → Invoicing, not in this codebase).
// Payment/void/failure status is mirrored back onto Submission.apcReport by
// apps/api/src/routes/webhooks.ts as Stripe's own webhooks fire.
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import Stripe from 'stripe'
import { ApcInvoiceJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder')

type Report = Record<string, unknown>

async function saveReport(submissionId: string, report: Report) {
  const stamped = { ...report, ranAt: new Date().toISOString() }
  await prisma.submission.update({
    where: { id: submissionId },
    data: { apcReport: stamped as Prisma.InputJsonValue },
  })
  return stamped
}

export async function apcProcessor(job: Job) {
  const d = ApcInvoiceJobSchema.parse(job.data)

  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: d.submissionId },
    include: { author: true, publication: true },
  })

  const amountCents = sub.publication.apcAmountCents
  if (!amountCents || amountCents <= 0) {
    return saveReport(d.submissionId, {
      status: 'skipped',
      reason: 'No APC configured for this publication',
    })
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return saveReport(d.submissionId, {
      status: 'skipped',
      reason: 'Stripe not configured (STRIPE_SECRET_KEY missing)',
    })
  }

  try {
    // Authors don't carry their own Stripe customer id (Tenant already uses
    // one for the org's PubFlow subscription — reusing it here would mix an
    // organization's subscription billing with an individual author's APC).
    // Find-or-create by email instead.
    const existing = await stripe.customers.list({ email: sub.author.email, limit: 1 })
    const customer = existing.data[0] ?? await stripe.customers.create({
      email: sub.author.email,
      name: `${sub.author.firstName ?? ''} ${sub.author.lastName ?? ''}`.trim() || undefined,
      metadata: { pubflowUserId: sub.author.id, pubflowTenantId: sub.tenantId },
    })

    await stripe.invoiceItems.create({
      customer: customer.id,
      amount: amountCents,
      currency: sub.publication.apcCurrency,
      description: `Article Processing Charge — "${sub.title}" (${sub.publication.title})`,
    })

    const draft = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 30,
      auto_advance: false, // we finalize/send explicitly below, deterministically
      metadata: { submissionId: sub.id, tenantId: sub.tenantId },
    })
    await stripe.invoices.finalizeInvoice(draft.id)
    const sent = await stripe.invoices.sendInvoice(draft.id)

    const report = await saveReport(d.submissionId, {
      status: 'invoiced',
      stripeInvoiceId: sent.id,
      stripeCustomerId: customer.id,
      hostedInvoiceUrl: sent.hosted_invoice_url ?? null,
      amountCents,
      currency: sub.publication.apcCurrency,
      invoicedAt: new Date().toISOString(),
    })

    await prisma.workflowLog.create({
      data: {
        submissionId: d.submissionId,
        toStatus: sub.status,
        performedBy: 'SYSTEM',
        note: `APC invoice sent (${(amountCents / 100).toFixed(2)} ${sub.publication.apcCurrency.toUpperCase()})`,
        metadata: report as Prisma.InputJsonValue,
      },
    })

    return report
  } catch (err) {
    return saveReport(d.submissionId, { status: 'error', error: String(err) })
  }
}
