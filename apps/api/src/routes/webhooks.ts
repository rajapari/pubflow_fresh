import type { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { createHash, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder')

export async function webhookRoutes(app: FastifyInstance) {
  // Override JSON parser in this scoped plugin to receive raw Buffer for Stripe signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    done(null, body)
  })

  app.post('/stripe', async (req, reply) => {
    const sig    = req.headers['stripe-signature'] as string | undefined
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? ''
    const raw    = req.body as Buffer

    if (!sig) { reply.status(400).send({ error: 'Missing Stripe signature' }); return }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(raw, sig, secret)
    } catch (err: any) {
      app.log.warn(`[Webhook] Stripe signature verification failed: ${err.message}`)
      reply.status(400).send({ error: 'Invalid signature' })
      return
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session
          const tenantId = session.metadata?.tenantId
          const plan     = session.metadata?.plan as 'PROFESSIONAL' | 'ENTERPRISE' | undefined
          if (!tenantId || !plan) break

          const sub = await stripe.subscriptions.retrieve(session.subscription as string)

          await prisma.$transaction([
            prisma.tenant.update({
              where: { id: tenantId },
              data:  { plan, stripeCustomerId: session.customer as string },
            }),
            prisma.subscription.create({
              data: {
                tenantId,
                stripeSubscriptionId: sub.id,
                stripePriceId:        sub.items.data[0].price.id,
                plan,
                status:               'ACTIVE',
                currentPeriodStart:   new Date(sub.current_period_start * 1000),
                currentPeriodEnd:     new Date(sub.current_period_end   * 1000),
              },
            }),
          ])
          app.log.info(`[Webhook] Tenant ${tenantId} upgraded to ${plan}`)
          break
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription
          const planMap: Record<string, 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'> = {
            active:    'PROFESSIONAL',
            trialing:  'PROFESSIONAL',
            past_due:  'PROFESSIONAL',
            canceled:  'STARTER',
            unpaid:    'STARTER',
            incomplete:'STARTER',
          }
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: sub.id },
            data:  {
              status:             sub.status.toUpperCase() as any,
              currentPeriodStart: new Date(sub.current_period_start * 1000),
              currentPeriodEnd:   new Date(sub.current_period_end   * 1000),
              cancelAtPeriodEnd:  sub.cancel_at_period_end,
            },
          })
          app.log.info(`[Webhook] Subscription ${sub.id} updated to ${sub.status}`)
          break
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription
          const dbSub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } })
          if (dbSub) {
            await Promise.all([
              prisma.subscription.update({ where: { id: dbSub.id }, data: { status: 'CANCELLED' } }),
              prisma.tenant.update({ where: { id: dbSub.tenantId }, data: { plan: 'STARTER' } }),
            ])
          }
          app.log.info(`[Webhook] Subscription ${sub.id} cancelled — tenant downgraded to STARTER`)
          break
        }

        default:
          app.log.debug(`[Webhook] Unhandled event type: ${event.type}`)
      }
    } catch (err: any) {
      app.log.error(`[Webhook] Handler error: ${err.message}`)
      reply.status(500).send({ error: 'Webhook handler failed' })
      return
    }

    reply.status(200).send({ received: true })
  })

  // Copyleaks completion callback. Unlike Stripe, Copyleaks doesn't sign its
  // webhook payloads — the URL-embedded token (minted by
  // apps/worker/src/processors/editorial.ts's runSimilarity, hashed before
  // it's ever persisted) is the only authenticity check. Copyleaks
  // substitutes the literal status word for the {STATUS} placeholder we
  // gave it, so the URL shape is /webhooks/copyleaks/:submissionId/:token/:status.
  app.post('/copyleaks/:submissionId/:token/:status', async (req, reply) => {
    const { submissionId, token, status } = req.params as {
      submissionId: string; token: string; status: string
    }

    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { similarityReport: true },
    })
    const report = sub?.similarityReport as Record<string, unknown> | null
    const storedHash = report?.['tokenHash'] as string | undefined

    // Constant-time compare so a mismatched token can't be brute-forced via
    // response-timing differences; the length check must happen first since
    // timingSafeEqual throws (not returns false) on length mismatch.
    const suppliedHash = createHash('sha256').update(token).digest('hex')
    const storedBuf = storedHash ? Buffer.from(storedHash) : null
    const suppliedBuf = Buffer.from(suppliedHash)
    const validToken = Boolean(storedBuf)
      && storedBuf!.length === suppliedBuf.length
      && timingSafeEqual(storedBuf!, suppliedBuf)

    if (!validToken) {
      app.log.warn(`[Webhook] Copyleaks: invalid token for submission ${submissionId}`)
      reply.status(403).send({ error: 'Invalid token' })
      return
    }

    // This plugin's JSON parser (registered above for Stripe's raw-body
    // signature check) hands every route in this scope a Buffer, not a
    // parsed object — parse it ourselves here.
    let body: {
      scanId?: string
      results?: {
        score?: {
          aggregatedScore?: number
          identicalWords?: number
          minorChangedWords?: number
          relatedMeaningWords?: number
        }
        database?: Array<{ title?: string; matchedWords?: string }>
        batch?: Array<{ title?: string; matchedWords?: string }>
        repositories?: Array<{ title?: string; matchedWords?: string }>
        internet?: Array<{ title?: string; matchedWords?: string }>
      }
    }
    try {
      body = JSON.parse((req.body as Buffer).toString('utf-8'))
    } catch {
      body = {}
    }

    if (status === 'completed') {
      const score = body.results?.score
      const matches = [
        ...(body.results?.internet ?? []),
        ...(body.results?.database ?? []),
        ...(body.results?.batch ?? []),
        ...(body.results?.repositories ?? []),
      ]
        .slice(0, 50)
        .map((m) => ({ title: m.title ?? null, matchedWords: m.matchedWords ?? null }))

      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          similarityReport: {
            status: 'done',
            provider: 'copyleaks',
            scanId: body.scanId ?? report?.['scanId'] ?? null,
            score: {
              aggregatedScore:     score?.aggregatedScore     ?? null,
              identicalWords:      score?.identicalWords      ?? null,
              minorChangedWords:   score?.minorChangedWords   ?? null,
              relatedMeaningWords: score?.relatedMeaningWords ?? null,
            },
            matches,
            ranAt: new Date().toISOString(),
          } as any,
        },
      })
      app.log.info(`[Webhook] Copyleaks scan completed for submission ${submissionId}`)
    } else if (status === 'error') {
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          similarityReport: {
            status: 'error',
            provider: 'copyleaks',
            error: JSON.stringify(body).slice(0, 2000),
            ranAt: new Date().toISOString(),
          } as any,
        },
      })
      app.log.warn(`[Webhook] Copyleaks scan errored for submission ${submissionId}`)
    }
    // Other statuses (credits-checked, indexed, export-completed, …) are
    // intermediate lifecycle events we don't act on yet — ack without change.

    reply.status(200).send({ received: true })
  })
}
