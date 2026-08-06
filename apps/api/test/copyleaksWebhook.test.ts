// Copyleaks completion webhook: token-based authenticity check (Copyleaks
// doesn't sign its callbacks) and report persistence. webhookRoutes only
// needs `prisma` — no auth/Redis/MinIO/BullMQ decorations — so this runs
// against a bare Fastify instance instead of the full buildServer() stack.
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { prisma } from '../src/lib/prisma.js'
import { webhookRoutes } from '../src/routes/webhooks.js'

let app: FastifyInstance
let tenantId: string
let submissionId: string

async function postWebhook(submissionId: string, token: string, status: string, body: unknown) {
  return app.inject({
    method: 'POST',
    url: `/webhooks/copyleaks/${submissionId}/${token}/${status}`,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  })
}

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register(webhookRoutes, { prefix: '/webhooks' })
  await app.ready()

  const tag = `copyleaks-wh-${randomUUID().slice(0, 8)}`
  const tenant = await prisma.tenant.create({ data: { name: `T ${tag}`, slug: `t-${tag}` } })
  tenantId = tenant.id
  const author = await prisma.user.create({
    data: { tenantId, keycloakId: `kc-${tag}`, email: `author-${tag}@test.local`, role: 'AUTHOR' },
  })
  const publication = await prisma.publication.create({ data: { tenantId, title: `Journal ${tag}` } })
  const submission = await prisma.submission.create({
    data: {
      tenantId, publicationId: publication.id, authorId: author.id,
      title: `Webhook test submission ${tag} long enough`, keywords: ['t'], status: 'SUBMITTED',
    },
  })
  submissionId = submission.id
})
afterAll(async () => {
  await prisma.submission.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  await app.close()
})

async function seedPendingReport(scanId: string) {
  const token = randomBytes(24).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await prisma.submission.update({
    where: { id: submissionId },
    data: { similarityReport: { status: 'pending', provider: 'copyleaks', scanId, tokenHash } },
  })
  return { token, tokenHash }
}

describe('POST /webhooks/copyleaks/:submissionId/:token/:status', () => {
  it('rejects a wrong token without touching the report', async () => {
    await seedPendingReport('scan-1')
    const res = await postWebhook(submissionId, 'not-the-real-token', 'completed', { scanId: 'scan-1' })
    expect(res.statusCode).toBe(403)
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })
    expect((sub.similarityReport as { status: string }).status).toBe('pending')
  })

  it('rejects any token when there is no pending report at all', async () => {
    await prisma.submission.update({ where: { id: submissionId }, data: { similarityReport: null } })
    const res = await postWebhook(submissionId, 'anything', 'completed', {})
    expect(res.statusCode).toBe(403)
  })

  it('accepts the correct token and stores score + matches on "completed"', async () => {
    const { token } = await seedPendingReport('scan-2')
    const res = await postWebhook(submissionId, token, 'completed', {
      scanId: 'scan-2',
      results: {
        score: { aggregatedScore: 12, identicalWords: 40, minorChangedWords: 5, relatedMeaningWords: 2 },
        internet: [{ title: 'Some Prior Paper', matchedWords: '40' }],
        database: [],
      },
    })
    expect(res.statusCode).toBe(200)

    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })
    const report = sub.similarityReport as {
      status: string; provider: string; scanId: string
      score: { aggregatedScore: number }
      matches: Array<{ title: string }>
      ranAt: string
    }
    expect(report.status).toBe('done')
    expect(report.provider).toBe('copyleaks')
    expect(report.scanId).toBe('scan-2')
    expect(report.score.aggregatedScore).toBe(12)
    expect(report.matches).toHaveLength(1)
    expect(report.matches[0]?.title).toBe('Some Prior Paper')
    expect(report.ranAt).toBeTruthy()
  })

  it('accepts the correct token and stores an error report on "error"', async () => {
    const { token } = await seedPendingReport('scan-3')
    const res = await postWebhook(submissionId, token, 'error', { scanId: 'scan-3', message: 'scan failed' })
    expect(res.statusCode).toBe(200)

    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })
    const report = sub.similarityReport as { status: string; provider: string; error: string }
    expect(report.status).toBe('error')
    expect(report.provider).toBe('copyleaks')
    expect(report.error).toContain('scan failed')
  })

  it('acks unknown intermediate statuses without changing the report', async () => {
    const { token } = await seedPendingReport('scan-4')
    const res = await postWebhook(submissionId, token, 'credits', { scanId: 'scan-4' })
    expect(res.statusCode).toBe(200)

    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })
    const report = sub.similarityReport as { status: string }
    expect(report.status).toBe('pending')
  })
})
