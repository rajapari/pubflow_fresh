// Preflight gate — submission.advanceStatus must refuse TYPESETTING →
// PROOF_REVIEW when the latest completed PDF_PRINT output failed (or never
// finished) its preflight check, and allow it through on pass/warn/absent.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { prisma } from '../src/lib/prisma.js'
import { makeCaller, closeTestConnections } from './caller.js'
import { createProofFixture, type ApiFixture } from './fixtures.js'

let fx: ApiFixture
let editor: ReturnType<typeof makeCaller>

beforeAll(async () => {
  fx = await createProofFixture('preflight')
  editor = makeCaller({ id: fx.editorId, tenantId: fx.tenantId, role: 'SECTION_EDITOR' })
})
afterAll(async () => {
  await fx.cleanup()
  await closeTestConnections()
})

beforeEach(async () => {
  await prisma.output.deleteMany({ where: { submissionId: fx.submissionId } })
  await prisma.submission.update({ where: { id: fx.submissionId }, data: { status: 'TYPESETTING' } })
})

function makePrintOutput(preflightReport: unknown, overrides: Partial<{ status: string; createdAt: Date }> = {}) {
  return prisma.output.create({
    data: {
      submissionId: fx.submissionId,
      format: 'PDF_PRINT',
      engine: 'LATEX',
      minioKey: 'outputs/x/x.pdf',
      status: (overrides.status ?? 'COMPLETED') as never,
      preflightReport: preflightReport as never,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  })
}

describe('preflight gate on advanceStatus → PROOF_REVIEW', () => {
  it('no PDF_PRINT output at all: not blocked', async () => {
    const updated = await editor.submission.advanceStatus({
      submissionId: fx.submissionId, toStatus: 'PROOF_REVIEW',
    })
    expect(updated.status).toBe('PROOF_REVIEW')
  })

  it('preflightReport.status "pass": allowed through', async () => {
    await makePrintOutput({ status: 'pass', checks: [] })
    const updated = await editor.submission.advanceStatus({
      submissionId: fx.submissionId, toStatus: 'PROOF_REVIEW',
    })
    expect(updated.status).toBe('PROOF_REVIEW')
  })

  it('preflightReport.status "warn": allowed through', async () => {
    await makePrintOutput({ status: 'warn', checks: [] })
    const updated = await editor.submission.advanceStatus({
      submissionId: fx.submissionId, toStatus: 'PROOF_REVIEW',
    })
    expect(updated.status).toBe('PROOF_REVIEW')
  })

  it('preflightReport.status "fail": blocked', async () => {
    await makePrintOutput({ status: 'fail', checks: [] })
    await expect(editor.submission.advanceStatus({
      submissionId: fx.submissionId, toStatus: 'PROOF_REVIEW',
    })).rejects.toThrow(/preflight check failed/i)
  })

  it('preflightReport.status "error" (service-call failure): blocked', async () => {
    await makePrintOutput({ status: 'error', checks: [], error: 'connection refused' })
    await expect(editor.submission.advanceStatus({
      submissionId: fx.submissionId, toStatus: 'PROOF_REVIEW',
    })).rejects.toThrow(/preflight check failed/i)
  })

  it('preflightReport still null (bot has not run yet): blocked', async () => {
    await makePrintOutput(null)
    await expect(editor.submission.advanceStatus({
      submissionId: fx.submissionId, toStatus: 'PROOF_REVIEW',
    })).rejects.toThrow(/has not completed yet/i)
  })

  it('a non-COMPLETED PDF_PRINT output (typesetting itself failed) is ignored by the gate', async () => {
    await makePrintOutput(null, { status: 'FAILED' })
    const updated = await editor.submission.advanceStatus({
      submissionId: fx.submissionId, toStatus: 'PROOF_REVIEW',
    })
    expect(updated.status).toBe('PROOF_REVIEW')
  })

  it('uses the most recently created COMPLETED PDF_PRINT output, not an older one', async () => {
    await makePrintOutput({ status: 'fail', checks: [] }, { createdAt: new Date(Date.now() - 60_000) })
    await makePrintOutput({ status: 'pass', checks: [] })
    const updated = await editor.submission.advanceStatus({
      submissionId: fx.submissionId, toStatus: 'PROOF_REVIEW',
    })
    expect(updated.status).toBe('PROOF_REVIEW')
  })
})
