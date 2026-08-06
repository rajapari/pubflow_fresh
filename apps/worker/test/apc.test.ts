// APC (Article Processing Charge) invoicing bot: skip paths and the happy
// path against a mocked Stripe SDK. The Stripe Node SDK uses its own HTTP
// client, not global fetch, so this needs vi.mock('stripe', ...) rather
// than the fetch-stubbing pattern used for the Anthropic/Copyleaks clients.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Job } from 'bullmq'
import { prisma } from '../src/lib/prisma.js'
import { createFixture, type Fixture } from './helpers.js'

const stripeMocks = vi.hoisted(() => ({
  customersList:      vi.fn(),
  customersCreate:    vi.fn(),
  invoiceItemsCreate: vi.fn(),
  invoicesCreate:     vi.fn(),
  invoicesFinalize:   vi.fn(),
  invoicesSend:       vi.fn(),
}))

// vi.mock calls are hoisted above every import in this file (including the
// static apcProcessor import below), so apc.ts's `new Stripe(...)` picks up
// this mock instead of the real SDK.
vi.mock('stripe', () => ({
  // `new Stripe(...)` requires a real constructor — an arrow function can't
  // be called with `new`. A plain function returning an object works: JS
  // constructor semantics use the returned object in place of `this`.
  default: vi.fn().mockImplementation(function StripeMock() {
    return {
      customers:    { list: stripeMocks.customersList, create: stripeMocks.customersCreate },
      invoiceItems: { create: stripeMocks.invoiceItemsCreate },
      invoices: {
        create:          stripeMocks.invoicesCreate,
        finalizeInvoice: stripeMocks.invoicesFinalize,
        sendInvoice:     stripeMocks.invoicesSend,
      },
    }
  }),
}))

import { apcProcessor } from '../src/processors/apc.js'

let fx: Fixture
const STRIPE_KEY_BACKUP = process.env.STRIPE_SECRET_KEY

beforeAll(async () => { fx = await createFixture('apc') })
afterAll(async () => {
  await fx.cleanup()
  if (STRIPE_KEY_BACKUP === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = STRIPE_KEY_BACKUP
})

const run = () => apcProcessor({ data: { type: 'APC_INVOICE', submissionId: fx.submissionId } } as Job)

describe('APC invoicing bot', () => {
  it('skips when the publication has no APC configured', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    await prisma.publication.update({ where: { id: fx.publicationId }, data: { apcAmountCents: null } })

    const report = await run()
    expect(report).toMatchObject({ status: 'skipped' })
    expect(String((report as { reason: string }).reason)).toMatch(/No APC configured/)
    expect(stripeMocks.customersList).not.toHaveBeenCalled()
  })

  it('skips when Stripe is not configured, even with an APC amount set', async () => {
    delete process.env.STRIPE_SECRET_KEY
    await prisma.publication.update({ where: { id: fx.publicationId }, data: { apcAmountCents: 150000 } })

    const report = await run()
    expect(report).toMatchObject({ status: 'skipped' })
    expect(String((report as { reason: string }).reason)).toMatch(/Stripe not configured/)
  })

  it('creates a customer, invoice item, and sends the invoice on the happy path', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    await prisma.publication.update({
      where: { id: fx.publicationId }, data: { apcAmountCents: 150000, apcCurrency: 'usd' },
    })

    stripeMocks.customersList.mockResolvedValueOnce({ data: [] })
    stripeMocks.customersCreate.mockResolvedValueOnce({ id: 'cus_123' })
    stripeMocks.invoiceItemsCreate.mockResolvedValueOnce({ id: 'ii_123' })
    stripeMocks.invoicesCreate.mockResolvedValueOnce({ id: 'in_123' })
    stripeMocks.invoicesFinalize.mockResolvedValueOnce({ id: 'in_123' })
    stripeMocks.invoicesSend.mockResolvedValueOnce({
      id: 'in_123', hosted_invoice_url: 'https://invoice.stripe.com/i/xyz',
    })

    const report = await run() as Record<string, unknown>
    expect(report).toMatchObject({
      status: 'invoiced',
      stripeInvoiceId: 'in_123',
      stripeCustomerId: 'cus_123',
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/xyz',
      amountCents: 150000,
      currency: 'usd',
    })

    expect(stripeMocks.customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.stringContaining('author-') }),
    )
    expect(stripeMocks.invoiceItemsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_123', amount: 150000, currency: 'usd' }),
    )
    expect(stripeMocks.invoicesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_123', collection_method: 'send_invoice' }),
    )

    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
    expect((sub.apcReport as { status: string }).status).toBe('invoiced')

    const log = await prisma.workflowLog.findFirst({
      where: { submissionId: fx.submissionId, note: { contains: 'APC invoice sent' } },
    })
    expect(log).toBeTruthy()
  })

  it('reuses an existing Stripe customer instead of creating a duplicate', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    await prisma.publication.update({ where: { id: fx.publicationId }, data: { apcAmountCents: 5000 } })

    stripeMocks.customersList.mockResolvedValueOnce({ data: [{ id: 'cus_existing' }] })
    stripeMocks.customersCreate.mockClear()
    stripeMocks.invoiceItemsCreate.mockResolvedValueOnce({ id: 'ii_456' })
    stripeMocks.invoicesCreate.mockResolvedValueOnce({ id: 'in_456' })
    stripeMocks.invoicesFinalize.mockResolvedValueOnce({ id: 'in_456' })
    stripeMocks.invoicesSend.mockResolvedValueOnce({ id: 'in_456', hosted_invoice_url: null })

    const report = await run() as Record<string, unknown>
    expect(report.stripeCustomerId).toBe('cus_existing')
    expect(stripeMocks.customersCreate).not.toHaveBeenCalled()
  })

  it('records an error report when Stripe throws', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    await prisma.publication.update({ where: { id: fx.publicationId }, data: { apcAmountCents: 5000 } })

    stripeMocks.customersList.mockRejectedValueOnce(new Error('stripe unavailable'))

    const report = await run()
    expect(report).toMatchObject({ status: 'error' })
    expect(String((report as { error: string }).error)).toMatch(/stripe unavailable/)
  })
})
