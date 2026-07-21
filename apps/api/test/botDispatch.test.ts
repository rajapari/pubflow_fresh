// Stage 6 — Orchestrator: stage-bot dispatch on workflow transitions.
// Verifies real jobs land in Redis with correct payloads, no-op paths,
// the never-throw contract, and copyedit style-bot dispatch rules.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { QUEUES } from '@pubflow/types'
import { prisma } from '../src/lib/prisma.js'
import { dispatchStageBots, dispatchCopyEditStyleBot } from '../src/lib/bot-dispatch.js'
import { getQueues, closeTestConnections } from './caller.js'
import { createProofFixture, type ApiFixture } from './fixtures.js'

let fx: ApiFixture
const queues = getQueues()

// Pull the most recent waiting job for a queue and remove it, so tests
// don't leak jobs into the real worker's backlog.
async function drainLatestJob(queueName: string) {
  const queue = queues[queueName as keyof typeof queues]
  const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized'], 0, 50)
  const mine = jobs
    .filter((j) => (j.data as { submissionId?: string }).submissionId === fx.submissionId)
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
  for (const j of mine) await j.remove()
  return mine[0] ?? null
}

beforeAll(async () => { fx = await createProofFixture('dispatch') })
afterAll(async () => {
  await fx.cleanup()
  await closeTestConnections()
})

describe('dispatchStageBots', () => {
  it('SUBMITTED with uploaded assets enqueues an intake job with full file list', async () => {
    await prisma.asset.createMany({
      data: [
        {
          submissionId: fx.submissionId, uploadedById: fx.authorId,
          filename: 'graphical_abstract.png', assetType: 'FIGURE',
          minioKey: 'assets/d/ga.png', mimeType: 'image/png', fileSizeBytes: 100,
        },
        {
          submissionId: fx.submissionId, uploadedById: fx.authorId,
          filename: 'supp_data.zip', assetType: 'SUPPLEMENTARY',
          minioKey: 'assets/d/supp.zip', mimeType: 'application/zip', fileSizeBytes: 200,
        },
      ],
    })

    await dispatchStageBots(prisma, queues, fx.submissionId, 'SUBMITTED')

    const job = await drainLatestJob(QUEUES.INTAKE)
    expect(job).not.toBeNull()
    const data = job!.data as { type: string; files: Array<{ assetId?: string; filename: string }>; useVision: boolean }
    expect(data.type).toBe('INTAKE')
    expect(data.useVision).toBe(true)
    expect(data.files).toHaveLength(2)
    // Existing Asset rows are re-classified, not duplicated.
    expect(data.files.every((f) => Boolean(f.assetId))).toBe(true)
  })

  it('SUBMITTED enqueues all three compliance jobs (ethics, data availability, license)', async () => {
    const complianceQueue = queues[QUEUES.COMPLIANCE]
    const forThisSubmission = async () => {
      const jobs = await complianceQueue.getJobs(['waiting', 'delayed', 'prioritized'], 0, 100)
      return jobs.filter((j) => (j.data as { submissionId?: string }).submissionId === fx.submissionId)
    }
    // Self-contained regardless of test order: clear any jobs a prior
    // SUBMITTED dispatch in this file left behind before asserting on ours.
    for (const j of await forThisSubmission()) await j.remove()

    await dispatchStageBots(prisma, queues, fx.submissionId, 'SUBMITTED')

    const mine = await forThisSubmission()
    expect(mine.map((j) => (j.data as { type: string }).type).sort()).toEqual(
      ['DATA_AVAILABILITY', 'ETHICS', 'LICENSE'],
    )
    for (const j of mine) await j.remove()
    await drainLatestJob(QUEUES.INTAKE) // drain the completeness-check job too
  })

  it('SUBMITTED with no assets still runs completeness but skips intake classification', async () => {
    await prisma.asset.deleteMany({ where: { submissionId: fx.submissionId } })
    await dispatchStageBots(prisma, queues, fx.submissionId, 'SUBMITTED')
    // Completeness runs unconditionally (even for create-in-editor submissions
    // that uploaded nothing) — but with zero assets there's nothing to classify.
    const job = await drainLatestJob(QUEUES.INTAKE)
    expect(job).not.toBeNull()
    expect((job!.data as { type: string }).type).toBe('COMPLETENESS')
  })

  it('statuses without bots are no-ops', async () => {
    await dispatchStageBots(prisma, queues, fx.submissionId, 'PEER_REVIEW')
    await dispatchStageBots(prisma, queues, fx.submissionId, 'PUBLISHED')
    expect(await drainLatestJob(QUEUES.INTAKE)).toBeNull()
  })

  it('never throws, even with a broken queue map', async () => {
    await prisma.asset.create({
      data: {
        submissionId: fx.submissionId, uploadedById: fx.authorId,
        filename: 'f.png', assetType: 'FIGURE',
        minioKey: 'assets/d/f.png', mimeType: 'image/png', fileSizeBytes: 1,
      },
    })
    const broken = { [QUEUES.INTAKE]: { add: () => { throw new Error('redis down') } } }
    await expect(
      dispatchStageBots(prisma, broken as never, fx.submissionId, 'SUBMITTED'),
    ).resolves.toBeUndefined()
    await prisma.asset.deleteMany({ where: { submissionId: fx.submissionId } })
  })
})

describe('dispatchCopyEditStyleBot', () => {
  const params = () => ({
    copyEditId: randomUUID(),
    submissionId: fx.submissionId,
    tenantId: fx.tenantId,
    publicationId: fx.publicationId,
  })

  it('skips when the manuscript format is unsupported (PDF)', async () => {
    await prisma.manuscript.create({
      data: {
        submissionId: fx.submissionId, format: 'PDF',
        minioPath: 'm', minioKey: 'manuscripts/d/m.pdf', fileSizeBytes: 10,
      },
    })
    await dispatchCopyEditStyleBot(prisma, queues, params())
    expect(await drainLatestJob(QUEUES.COPYEDIT)).toBeNull()
    await prisma.manuscript.deleteMany({ where: { submissionId: fx.submissionId } })
  })

  it('enqueues with the publication default profile when one exists', async () => {
    await prisma.manuscript.create({
      data: {
        submissionId: fx.submissionId, format: 'DOCX',
        minioPath: 'm', minioKey: 'manuscripts/d/m.docx', fileSizeBytes: 10,
      },
    })
    const tenantDefault = await prisma.styleProfile.create({
      data: {
        tenantId: fx.tenantId, name: `Tenant default ${randomUUID().slice(0, 6)}`,
        manual: 'CHICAGO17', isDefault: true,
      },
    })
    const pubDefault = await prisma.styleProfile.create({
      data: {
        tenantId: fx.tenantId, publicationId: fx.publicationId,
        name: `Pub default ${randomUUID().slice(0, 6)}`,
        manual: 'AMA11', cslStyle: 'american-medical-association', isDefault: true,
      },
    })

    await dispatchCopyEditStyleBot(prisma, queues, params())

    const job = await drainLatestJob(QUEUES.COPYEDIT)
    expect(job).not.toBeNull()
    const data = job!.data as Record<string, unknown>
    expect(data.type).toBe('COPYEDIT')
    expect(data.inputFormat).toBe('docx')
    // Publication-scoped default must beat the tenant-wide default.
    expect(data.styleProfileId).toBe(pubDefault.id)
    expect(data.styleManual).toBe('AMA11')
    expect(data.cslStyle).toBe('american-medical-association')

    await prisma.styleProfile.deleteMany({ where: { id: { in: [tenantDefault.id, pubDefault.id] } } })
    await prisma.manuscript.deleteMany({ where: { submissionId: fx.submissionId } })
  })

  it('falls back to INHOUSE when no profile exists', async () => {
    await prisma.manuscript.create({
      data: {
        submissionId: fx.submissionId, format: 'LATEX',
        minioPath: 'm', minioKey: 'manuscripts/d/m.tex', fileSizeBytes: 10,
      },
    })
    await dispatchCopyEditStyleBot(prisma, queues, params())
    const job = await drainLatestJob(QUEUES.COPYEDIT)
    expect(job).not.toBeNull()
    expect((job!.data as Record<string, unknown>).styleManual).toBe('INHOUSE')
    expect((job!.data as Record<string, unknown>).inputFormat).toBe('latex')
    await prisma.manuscript.deleteMany({ where: { submissionId: fx.submissionId } })
  })
})
