import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import Stripe from 'stripe'
import { router, protectedProcedure, chiefEditorProcedure } from '../trpc/procedures.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder')

const PRICE_IDS: Record<string, string | undefined> = {
  PROFESSIONAL: process.env.STRIPE_PRICE_PROFESSIONAL,
  ENTERPRISE:   process.env.STRIPE_PRICE_ENTERPRISE,
}

export const billingRouter = router({
  getCurrentPlan: protectedProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.prisma.tenant.findUnique({
      where:   { id: ctx.user.tenantId },
      include: {
        subscriptions: {
          where:   { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
    return {
      plan:         tenant?.plan ?? 'STARTER',
      subscription: tenant?.subscriptions[0] ?? null,
    }
  }),

  createCheckoutSession: chiefEditorProcedure
    .input(z.object({ plan: z.enum(['PROFESSIONAL', 'ENTERPRISE']) }))
    .mutation(async ({ ctx, input }) => {
      const priceId = PRICE_IDS[input.plan]
      if (!priceId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Stripe price not configured for this plan' })

      const tenant = await ctx.prisma.tenant.findUnique({ where: { id: ctx.user.tenantId } })
      if (!tenant) throw new TRPCError({ code: 'NOT_FOUND' })

      let customerId = tenant.stripeCustomerId
      if (!customerId) {
        const customer = await stripe.customers.create({
          email:    ctx.user.email,
          metadata: { tenantId: ctx.user.tenantId },
        })
        customerId = customer.id
        await ctx.prisma.tenant.update({
          where: { id: ctx.user.tenantId },
          data:  { stripeCustomerId: customerId },
        })
      }

      const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
      const session = await stripe.checkout.sessions.create({
        customer:             customerId,
        mode:                 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/dashboard/settings/billing?success=1`,
        cancel_url:  `${appUrl}/dashboard/settings/billing?cancelled=1`,
        metadata:    { tenantId: ctx.user.tenantId, plan: input.plan },
      })

      return { url: session.url }
    }),

  getPortalUrl: chiefEditorProcedure.mutation(async ({ ctx }) => {
    const tenant = await ctx.prisma.tenant.findUnique({ where: { id: ctx.user.tenantId } })
    if (!tenant?.stripeCustomerId)
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active subscription found' })

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
    const session = await stripe.billingPortal.sessions.create({
      customer:   tenant.stripeCustomerId,
      return_url: `${appUrl}/dashboard/settings/billing`,
    })
    return { url: session.url }
  }),
})
