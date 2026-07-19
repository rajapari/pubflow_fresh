// Phase C — editorial-intelligence processor: report persistence, graceful
// degradation without AI, and AI paths via stubbed fetch.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { Job } from 'bullmq'
import { editorialProcessor } from '../src/processors/editorial.js'
import { prisma } from '../src/lib/prisma.js'
import { createFixture, type Fixture } from './helpers.js'

let fx: Fixture
const KEY_BACKUP = process.env.ANTHROPIC_API_KEY

beforeAll(async () => { fx = await createFixture('editorial') })
afterAll(async () => {
  await fx.cleanup()
  if (KEY_BACKUP === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = KEY_BACKUP
})
afterEach(() => vi.unstubAllGlobals())

const run = (type: string) =>
  editorialProcessor({ data: { type, submissionId: fx.submissionId } } as Job)

function stubAi(json: unknown) {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(json) }] }),
  })))
}

describe('screening', () => {
  it('without AI: skipped report persisted with reason', async () => {
    delete process.env.ANTHROPIC_API_KEY
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
    process.env.ANTHROPIC_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }),
    })))
    const report = await run('SCREENING')
    expect(report).toMatchObject({ status: 'error' })
  })
})

describe('rebuttal coverage', () => {
  it('skips when there are no submitted reviews', async () => {
    delete process.env.ANTHROPIC_API_KEY
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
  it('records why it did not run when no provider configured', async () => {
    delete process.env.COPYLEAKS_API_KEY
    const report = await run('SIMILARITY')
    expect(report).toMatchObject({ status: 'skipped', provider: null })
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
    expect((sub.similarityReport as { reason: string }).reason).toMatch(/No similarity provider/)
  })
})

describe('routing', () => {
  it('rejects unknown job types', async () => {
    await expect(run('MYSTERY')).rejects.toThrow()
  })
})
