// Phase C — editorial-intelligence processor: report persistence, graceful
// degradation without AI, and AI paths via stubbed fetch.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { Job } from 'bullmq'
import { editorialProcessor } from '../src/processors/editorial.js'
import { prisma } from '../src/lib/prisma.js'
import { createFixture, uploadFixture, type Fixture } from './helpers.js'

let fx: Fixture
const KEY_BACKUP = process.env.ANTHROPIC_API_KEY_DEV
const COPYLEAKS_KEY_BACKUP   = process.env.COPYLEAKS_API_KEY
const COPYLEAKS_EMAIL_BACKUP = process.env.COPYLEAKS_EMAIL

beforeAll(async () => { fx = await createFixture('editorial') })
afterAll(async () => {
  await fx.cleanup()
  if (KEY_BACKUP === undefined) delete process.env.ANTHROPIC_API_KEY_DEV
  else process.env.ANTHROPIC_API_KEY_DEV = KEY_BACKUP
  if (COPYLEAKS_KEY_BACKUP === undefined) delete process.env.COPYLEAKS_API_KEY
  else process.env.COPYLEAKS_API_KEY = COPYLEAKS_KEY_BACKUP
  if (COPYLEAKS_EMAIL_BACKUP === undefined) delete process.env.COPYLEAKS_EMAIL
  else process.env.COPYLEAKS_EMAIL = COPYLEAKS_EMAIL_BACKUP
})
afterEach(() => vi.unstubAllGlobals())

const run = (type: string) =>
  editorialProcessor({ data: { type, submissionId: fx.submissionId } } as Job)

function stubAi(json: unknown) {
  process.env.ANTHROPIC_API_KEY_DEV = 'test-key'
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(json) }] }),
  })))
}

describe('screening', () => {
  it('without AI: skipped report persisted with reason', async () => {
    delete process.env.ANTHROPIC_API_KEY_DEV
    const report = await run('SCREENING')
    expect(report).toMatchObject({ status: 'skipped' })
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
    expect((sub.screeningReport as { status: string }).status).toBe('skipped')
    expect((sub.screeningReport as { ranAt: string }).ranAt).toBeTruthy()
  })

  it('with AI: structured triage stored + workflow log written', async () => {
    stubAi({
      scopeFit: 'borderline', scopeReason: 'adjacent to aims',
      qualityFlags: ['vague methods'], integrityFlags: [],
      recommendation: 'scrutinize',
    })
    const report = await run('SCREENING')
    expect(report).toMatchObject({ status: 'done', scopeFit: 'borderline', recommendation: 'scrutinize' })
    const log = await prisma.workflowLog.findFirst({
      where: { submissionId: fx.submissionId, note: 'AI screening triage' },
    })
    expect(log).toBeTruthy()
  })

  it('AI failure → error report persisted, job resolves', async () => {
    process.env.ANTHROPIC_API_KEY_DEV = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }),
    })))
    const report = await run('SCREENING')
    expect(report).toMatchObject({ status: 'error' })
  })
})

describe('rebuttal coverage', () => {
  it('skips when there are no submitted reviews', async () => {
    delete process.env.ANTHROPIC_API_KEY_DEV
    const report = await run('REBUTTAL')
    expect(report).toMatchObject({ status: 'skipped' })
    expect(String((report as { reason: string }).reason)).toMatch(/No completed reviews/)
  })

  it('with reviews + AI: coverage mapping stored on the submission', async () => {
    await prisma.review.create({
      data: {
        submissionId: fx.submissionId, reviewerId: fx.proofReaderId,
        status: 'SUBMITTED', comments: 'Please clarify the sample size. Fix Figure 2 axis labels.',
        submittedAt: new Date(),
      },
    })
    stubAi({
      points: [
        { reviewer: 1, point: 'clarify sample size', addressed: 'yes', evidence: 'methods updated' },
        { reviewer: 1, point: 'fix Figure 2 axes', addressed: 'no', evidence: 'no related change' },
      ],
      unaddressedCount: 1,
      summary: 'One point remains open.',
    })
    const report = await run('REBUTTAL')
    expect(report).toMatchObject({ status: 'done', unaddressedCount: 1 })
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
    expect((sub.rebuttalReport as { points: unknown[] }).points).toHaveLength(2)
  })
})

describe('similarity adapter', () => {
  afterEach(() => {
    delete process.env.COPYLEAKS_API_KEY
    delete process.env.COPYLEAKS_EMAIL
  })

  it('records why it did not run when no provider configured', async () => {
    delete process.env.COPYLEAKS_API_KEY
    delete process.env.COPYLEAKS_EMAIL
    const report = await run('SIMILARITY')
    expect(report).toMatchObject({ status: 'skipped', provider: null })
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
    expect((sub.similarityReport as { reason: string }).reason).toMatch(/No similarity provider/)
  })

  it('skips cleanly when configured but no manuscript uploaded', async () => {
    process.env.COPYLEAKS_API_KEY = 'test-key'
    process.env.COPYLEAKS_EMAIL = 'test@example.com'
    const report = await run('SIMILARITY')
    expect(report).toMatchObject({ status: 'skipped', provider: 'copyleaks' })
  })

  it('submits the manuscript and records a pending report with a hashed (not raw) token', async () => {
    process.env.COPYLEAKS_API_KEY = 'test-key'
    process.env.COPYLEAKS_EMAIL = 'test@example.com'
    const key = await uploadFixture(`test-fixtures/${fx.submissionId}/similarity.docx`, 'manuscript text')
    await prisma.manuscript.create({
      data: {
        submissionId: fx.submissionId, format: 'DOCX',
        minioPath: `s3://pubflow-files/${key}`, minioKey: key,
        fileSizeBytes: 14, version: 1, isLatest: true,
      },
    })

    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url))
      if (String(url).includes('/account/login/api')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }
      }
      return { ok: true, status: 200, text: async () => '', json: async () => ({}) }
    }))

    const report = await run('SIMILARITY') as Record<string, unknown>
    expect(report).toMatchObject({ status: 'pending', provider: 'copyleaks' })
    expect(typeof report.scanId).toBe('string')
    expect(typeof report.tokenHash).toBe('string')
    expect(report.token).toBeUndefined()
    expect(calls.some((u) => u.includes('/scans/submit/file/'))).toBe(true)

    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
    expect((sub.similarityReport as { status: string }).status).toBe('pending')
    expect((sub.similarityReport as Record<string, unknown>).token).toBeUndefined()
  })

  it('records an error report when the provider call fails', async () => {
    process.env.COPYLEAKS_API_KEY = 'test-key'
    process.env.COPYLEAKS_EMAIL = 'test@example.com'
    const key = await uploadFixture(`test-fixtures/${fx.submissionId}/similarity2.docx`, 'manuscript text')
    await prisma.manuscript.updateMany({ where: { submissionId: fx.submissionId }, data: { isLatest: false } })
    await prisma.manuscript.create({
      data: {
        submissionId: fx.submissionId, format: 'DOCX',
        minioPath: `s3://pubflow-files/${key}`, minioKey: key,
        fileSizeBytes: 14, version: 2, isLatest: true,
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })))

    const report = await run('SIMILARITY')
    expect(report).toMatchObject({ status: 'error', provider: 'copyleaks' })
  })
})

describe('routing', () => {
  it('rejects unknown job types', async () => {
    await expect(run('MYSTERY')).rejects.toThrow()
  })
})
