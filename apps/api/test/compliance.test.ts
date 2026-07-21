// Compliance API: updateCompliance (author-editable fields, status gate) and
// runComplianceCheck (author/editor manual re-run) role and validation matrix.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { QUEUES } from '@pubflow/types'
import { prisma } from '../src/lib/prisma.js'
import { makeCaller, getQueues, closeTestConnections } from './caller.js'
import { createProofFixture, type ApiFixture } from './fixtures.js'

let fx: ApiFixture
let draftId: string
let author: ReturnType<typeof makeCaller>
let editor: ReturnType<typeof makeCaller>
let outsider: ReturnType<typeof makeCaller>
const queues = getQueues()

async function drainLatestJob(queueName: string, submissionId: string) {
  const queue = queues[queueName as keyof typeof queues]
  const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized'], 0, 50)
  const mine = jobs.filter((j) => (j.data as { submissionId?: string }).submissionId === submissionId)
  for (const j of mine) await j.remove()
  return mine
}

beforeAll(async () => {
  fx = await createProofFixture('compliance')
  author   = makeCaller({ id: fx.authorId, tenantId: fx.tenantId, role: 'AUTHOR' })
  editor   = makeCaller({ id: fx.editorId, tenantId: fx.tenantId, role: 'SECTION_EDITOR' })
  outsider = makeCaller({ id: fx.outsiderEditorId, tenantId: fx.outsiderTenantId, role: 'SECTION_EDITOR' })

  const draft = await prisma.submission.create({
    data: {
      tenantId: fx.tenantId, publicationId: fx.publicationId, authorId: fx.authorId,
      title: `Compliance draft ${randomUUID().slice(0, 8)} long enough title`,
      keywords: ['t'], status: 'DRAFT',
    },
  })
  draftId = draft.id
})
afterAll(async () => {
  await prisma.submission.deleteMany({ where: { id: draftId } })
  await fx.cleanup()
  await closeTestConnections()
})

describe('updateCompliance', () => {
  it('author sets statements, license, and copyright agreement', async () => {
    const updated = await author.submission.updateCompliance({
      id: draftId,
      ethicsStatement: 'IRB approved, protocol #001.',
      fundingStatement: 'NSF grant #99999.',
      coiStatement: 'None declared.',
      dataAvailabilityStatement: 'https://osf.io/abc123',
      licenseType: 'CC_BY',
      agreeToCopyright: true,
    })
    expect(updated.ethicsStatement).toContain('IRB approved')
    expect(updated.licenseType).toBe('CC_BY')
    expect(updated.copyrightAgreedAt).toBeTruthy()
  })

  it('toggling agreeToCopyright to false clears the timestamp', async () => {
    const updated = await author.submission.updateCompliance({
      id: draftId, agreeToCopyright: false,
    })
    expect(updated.copyrightAgreedAt).toBeNull()
  })

  it('a non-author cannot edit another author’s compliance fields', async () => {
    await expect(editor.submission.updateCompliance({
      id: draftId, coiStatement: 'Injected by editor',
    })).rejects.toThrow(/NOT_FOUND|not found/i)
  })

  it('rejects edits once the submission has moved past the editable window', async () => {
    // fx.submissionId is fixed up in PROOF_REVIEW by createProofFixture — outside the editable window.
    await expect(author.submission.updateCompliance({
      id: fx.submissionId, coiStatement: 'too late',
    })).rejects.toThrow(/Cannot edit compliance/)
  })

  it('rejects an oversized statement', async () => {
    await expect(author.submission.updateCompliance({
      id: draftId, ethicsStatement: 'x'.repeat(5001),
    })).rejects.toThrow()
  })
})

describe('runComplianceCheck', () => {
  it('author can queue all three compliance jobs', async () => {
    const res = await author.submission.runComplianceCheck({ id: draftId })
    expect(res).toEqual({ queued: true })

    const ethics = await drainLatestJob(QUEUES.COMPLIANCE, draftId)
    expect(ethics.map((j) => (j.data as { type: string }).type).sort()).toEqual(
      ['DATA_AVAILABILITY', 'ETHICS', 'LICENSE'],
    )
  })

  it('an editor in the same tenant can also queue a re-check', async () => {
    const res = await editor.submission.runComplianceCheck({ id: draftId })
    expect(res).toEqual({ queued: true })
    await drainLatestJob(QUEUES.COMPLIANCE, draftId) // drain to avoid leaking into other tests
  })

  it('a stranger outside the tenant cannot trigger a re-check', async () => {
    await expect(outsider.submission.runComplianceCheck({ id: draftId }))
      .rejects.toThrow(/NOT_FOUND|not found/i)
  })
})
