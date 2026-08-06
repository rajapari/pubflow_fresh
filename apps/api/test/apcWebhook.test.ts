// Stripe invoice.* webhook handling for APC payment status. Mirrors
// copyleaksWebhook.test.ts's bare-Fastify-instance approach, but this route
// also needs stripe.webhooks.constructEvent() mocked — we're not sending a
// real Stripe signature, so the real SDK would reject every request here.
import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { prisma } from '../src/lib/prisma.js'

const stripeMocks = vi.hoisted(() => ({ constructEvent: vi.fn() }))

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(function StripeMock() {
    return { webhooks: { constructEvent: stripeMocks.constructEvent } }
  }),
}))

const { webhookRoutes } = await import('../src/routes/webhooks.js')

let app: FastifyInstance
let tenantId: string
let submissionId: string

function stripeEvent(type: string, object: Record<string, unknown>) {
  return { id: `evt_${randomUUID().slice(0, 8)}`, type, data: { object } }
}

// constructEvent is mocked per-test to return a canned event regardless of
// the actual payload, so the raw body here is a placeholder.
async function postStripeWebhook() {
  return app.inject({
    method: 'POST',
    url: '/webhooks/stripe',
    headers: { 'content-type': 'application/json', 'stripe-signature': 'test-sig' },
    payload: JSON.stringify({ irrelevant: 'raw body — constructEvent is mocked' }),
  })
}

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register(webhookRoutes, { prefix: '/webhooks' })
  await app.ready()

  const tag = `apc-wh-${randomUUID().slice(0, 8)}`
  const tenant = await prisma.tenant.create({ data: { name: `T ${tag}`, slug: `t-${tag}` } })
  tenantId = tenant.id
  const author = await prisma.user.create({
    data: { tenantId, keycloakId: `kc-${tag}`, email: `author-${tag}@test.local`, role: 'AUTHOR' },
  })
  const publication = await prisma.publication.create({
    data: { tenantId, title: `Journal ${tag}`, apcAmountCents: 150000 },
  })
  const submission = await prisma.submission.create({
    data: {
      tenantId, publicationId: publication.id, authorId: author.id,
      title: `APC webhook test submission ${tag} long enough`, keywords: ['t'], status: 'ACCEPTED',
      apcReport: { status: 'invoiced', stripeInvoiceId: 'in_123', amountCents: 150000, currency: 'usd' },
    },
  })
  submissionId = submission.id
})
afterAll(async () => {
  await prisma.submission.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  await app.close()
})

describe('POST /webhooks/stripe — invoice.* events', () => {
  it('marks the APC report paid on invoice.paid, preserving existing fields', async () => {
    stripeMocks.constructEvent.mockReturnValueOnce(
      stripeEvent('invoice.paid', { id: 'in_123', metadata: { submissionId } }),
    )
    const res = await postStripeWebhook()
    expect(res.statusCode).toBe(200)

    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })
    const report = sub.apcReport as { status: string; amountCents: number; paidAt: string }
    expect(report.status).toBe('paid')
    expect(report.amountCents).toBe(150000) // untouched from the seed
    expect(report.paidAt).toBeTruthy()
  })

  it('marks payment_failed on invoice.payment_failed', async () => {
    stripeMocks.constructEvent.mockReturnValueOnce(
      stripeEvent('invoice.payment_failed', { id: 'in_123', metadata: { submissionId } }),
    )
    const res = await postStripeWebhook()
    expect(res.statusCode).toBe(200)

    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })
    expect((sub.apcReport as { status: string }).status).toBe('payment_failed')
  })

  it('marks void on invoice.voided', async () => {
    stripeMocks.constructEvent.mockReturnValueOnce(
      stripeEvent('invoice.voided', { id: 'in_123', metadata: { submissionId } }),
    )
    const res = await postStripeWebhook()
    expect(res.statusCode).toBe(200)

    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })
    expect((sub.apcReport as { status: string }).status).toBe('void')
  })

  it('ignores invoice events with no submissionId in metadata (not an APC invoice)', async () => {
    stripeMocks.constructEvent.mockReturnValueOnce(
      stripeEvent('invoice.paid', { id: 'in_999', metadata: {} }),
    )
    const before = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })
    const res = await postStripeWebhook()
    expect(res.statusCode).toBe(200)

    const after = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })
    expect(after.apcReport).toEqual(before.apcReport)
  })

  it('rejects a request with no stripe-signature header', async () => {
    const res = await app.inject({
      method: 'POST', url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    })
    expect(res.statusCode).toBe(400)
  })
})
