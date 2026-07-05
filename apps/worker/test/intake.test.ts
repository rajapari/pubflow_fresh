// Stage 2 — Intake classifier: table-driven heuristics + DB integration.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Job } from 'bullmq'
import { classify, intakeProcessor } from '../src/processors/intake.js'
import { prisma } from '../src/lib/prisma.js'
import { createFixture, type Fixture } from './helpers.js'

const UUID = randomUUID()
const file = (filename: string, mimeType: string, assetId?: string) => ({
  minioKey: `assets/test/${filename}`,
  filename,
  mimeType,
  sizeBytes: 1234,
  uploadedById: UUID,
  assetId,
})

describe('classify() heuristics', () => {
  const CASES: Array<[string, string, string | null]> = [
    // graphical abstract naming variants
    ['graphical_abstract.png',    'image/png',  'GRAPHICAL_ABSTRACT'],
    ['Graphical Abstract.tif',    'image/tiff', 'GRAPHICAL_ABSTRACT'],
    ['GraphicalAbstract.png',     'image/png',  'GRAPHICAL_ABSTRACT'],
    ['visual-abstract.jpg',       'image/jpeg', 'GRAPHICAL_ABSTRACT'],
    ['VisualAbstract_final.jpeg', 'image/jpeg', 'GRAPHICAL_ABSTRACT'],
    ['toc-graphic.eps',           'application/postscript', 'GRAPHICAL_ABSTRACT'],
    ['paper_graphabs.png',        'image/png',  'GRAPHICAL_ABSTRACT'],
    // cover art
    ['cover.jpg',            'image/jpeg', 'COVER'],
    ['FrontCover_v2.png',    'image/png',  'COVER'],
    // supplementary by name
    ['supplementary_table_S1.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'SUPPLEMENTARY'],
    ['Supporting Information.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'SUPPLEMENTARY'],
    ['Appendix_A.docx',      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'SUPPLEMENTARY'],
    ['dataset_raw.csv',      'text/csv', 'SUPPLEMENTARY'],
    // supplementary by type (media/archives)
    ['experiment.mp4',       'video/mp4', 'SUPPLEMENTARY'],
    ['recordings.zip',       'application/zip', 'SUPPLEMENTARY'],
    ['interview_audio.wav',  'audio/wav', 'SUPPLEMENTARY'],
    ['analysis-code.tar',    'application/x-tar', 'SUPPLEMENTARY'],
    // tables
    ['Table1.png',           'image/png', 'TABLE'],
    ['table_2_results.csv',  'text/csv',  'TABLE'],
    // figures
    ['fig1.png',             'image/png',  'FIGURE'],
    ['Figure_2.tiff',        'image/tiff', 'FIGURE'],
    ['diagram.svg',          'image/svg+xml', 'FIGURE'],
    ['photo.webp',           'image/webp', 'FIGURE'],
    // main manuscript (null = not an asset)
    ['manuscript.docx',      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', null],
    ['main_text.tex',        'application/x-tex', null],
    ['article-final.pdf',    'application/pdf', null],
    ['paper.md',             'text/markdown', null],
    // unknown → supplementary (safe default)
    ['weird.xyz',            'application/octet-stream', 'SUPPLEMENTARY'],
  ]

  it.each(CASES)('%s (%s) → %s', (filename, mimeType, expected) => {
    const result = classify(file(filename, mimeType))
    expect(result.assetType).toBe(expected)
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.reason).toBeTruthy()
  })
})

describe('intakeProcessor (DB integration, vision off)', () => {
  let fx: Fixture
  beforeAll(async () => { fx = await createFixture('intake') })
  afterAll(async () => { await fx.cleanup() })

  const runJob = (files: unknown[]) =>
    intakeProcessor({
      data: { type: 'INTAKE', submissionId: fx.submissionId, files, useVision: false },
    } as Job)

  it('creates classified assets, links deliverable files, logs workflow', async () => {
    const summary = await runJob([
      file('graphical_abstract.png', 'image/png'),
      file('supplementary_data.zip', 'application/zip'),
      file('fig1.png', 'image/png'),
      file('manuscript.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ].map((f) => ({ ...f, uploadedById: fx.authorId })))

    expect(summary).toMatchObject({
      created: 3, updated: 0, manuscripts: 1, supplementary: 1, graphicalAbstract: 1,
    })

    const assets = await prisma.asset.findMany({ where: { submissionId: fx.submissionId } })
    expect(assets).toHaveLength(3)

    const ga = assets.find((a) => a.assetType === 'GRAPHICAL_ABSTRACT')
    expect(ga?.filename).toBe('graphical_abstract.png')
    expect((ga?.metadata as { linkedToDeliverable?: boolean }).linkedToDeliverable).toBe(true)

    const supp = assets.find((a) => a.assetType === 'SUPPLEMENTARY')
    expect((supp?.metadata as { linkedToDeliverable?: boolean }).linkedToDeliverable).toBe(true)

    const figure = assets.find((a) => a.assetType === 'FIGURE')
    expect((figure?.metadata as { linkedToDeliverable?: boolean }).linkedToDeliverable).toBe(false)

    const log = await prisma.workflowLog.findFirst({
      where: { submissionId: fx.submissionId, performedBy: 'SYSTEM' },
      orderBy: { createdAt: 'desc' },
    })
    expect(log?.note).toMatch(/Intake classifier/)
    expect((log?.metadata as { graphicalAbstract?: number }).graphicalAbstract).toBe(1)
  })

  it('re-classifies existing assets via assetId (update path)', async () => {
    // Simulate a file mis-uploaded as FIGURE that is really supplementary.
    const existing = await prisma.asset.create({
      data: {
        submissionId: fx.submissionId,
        uploadedById: fx.authorId,
        filename: 'supplementary_video.mp4',
        assetType: 'FIGURE',
        minioKey: 'assets/test/supplementary_video.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 999,
      },
    })

    const summary = await runJob([
      { ...file('supplementary_video.mp4', 'video/mp4', existing.id), uploadedById: fx.authorId },
    ])
    expect(summary).toMatchObject({ created: 0, updated: 1, supplementary: 1 })

    const reloaded = await prisma.asset.findUniqueOrThrow({ where: { id: existing.id } })
    expect(reloaded.assetType).toBe('SUPPLEMENTARY')
  })

  it('enforces a single graphical abstract (best confidence wins)', async () => {
    const fx2 = await createFixture('intake-ga')
    try {
      const summary = await intakeProcessor({
        data: {
          type: 'INTAKE',
          submissionId: fx2.submissionId,
          useVision: false,
          files: [
            { ...file('graphical_abstract.png', 'image/png'), uploadedById: fx2.authorId },
            { ...file('visual-abstract-alt.jpg', 'image/jpeg'), uploadedById: fx2.authorId },
          ],
        },
      } as Job)

      expect(summary.graphicalAbstract).toBe(1)
      const assets = await prisma.asset.findMany({ where: { submissionId: fx2.submissionId } })
      expect(assets.filter((a) => a.assetType === 'GRAPHICAL_ABSTRACT')).toHaveLength(1)
      expect(assets.filter((a) => a.assetType === 'FIGURE')).toHaveLength(1)
    } finally {
      await fx2.cleanup()
    }
  })

  it('rejects an invalid job payload', async () => {
    await expect(
      intakeProcessor({ data: { type: 'INTAKE', submissionId: fx.submissionId, files: [] } } as Job),
    ).rejects.toThrow()
  })
})
