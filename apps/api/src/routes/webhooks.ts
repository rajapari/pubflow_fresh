import type { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
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
}
