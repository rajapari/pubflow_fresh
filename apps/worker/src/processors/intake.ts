// ── Intake file classifier / separator ───────────────────
// Classifies every file in a submission bundle and separates SUPPLEMENTARY
// material and the single GRAPHICAL_ABSTRACT so they can be linked to the
// final published deliverable. Deterministic heuristics first; an optional AI
// vision pass disambiguates the graphical abstract among figures.
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { IntakeJobSchema } from '@pubflow/types'
import type { IntakeFile } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio } from '../lib/storage.js'
import { aiEnabled, aiJSON } from '../lib/ai.js'

type AssetType = 'FIGURE' | 'TABLE' | 'SUPPLEMENTARY' | 'GRAPHICAL_ABSTRACT' | 'COVER'

interface Classification {
  assetType: AssetType | null // null = main manuscript (not an asset)
  confidence: number
  reason: string
}

const GA_HINTS   = ['graphical abstract', 'graphicalabstract', 'graphabstract', 'visual abstract', 'visualabstract', 'toc graphic', 'tocgraphic', 'graphabs']
const COVER_HINTS = ['cover', 'front-cover', 'frontcover']
const SUPP_HINTS = ['supplement', 'supplementary', 'supporting information', 'supporting-information', 'appendix', 'dataset', 'data set', 'raw data', 'video', 'movie', 'audio', 'code', 'sourcedata', 'annex']
const TABLE_HINTS = ['table']
const MAIN_HINTS = ['manuscript', 'main-document', 'main document', 'maintext', 'main text', 'main_text', 'article']

const IMAGE_MIME = /^image\//
const VIDEO_MIME = /^(video|audio)\//
const DOC_MIME = /(msword|wordprocessingml|opendocument\.text|x-tex|latex|pdf|rtf|markdown)/

function norm(s: string): string {
  // Underscores and hyphens both act as word separators in filenames.
  return s.toLowerCase().replace(/[_-]/g, ' ')
}

function extOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

// Deterministic first-pass classification from filename + MIME type.
// Exported for unit tests.
export function classify(file: IntakeFile): Classification {
  const name = norm(file.filename)
  const ext  = extOf(file.filename)
  const mime = file.mimeType.toLowerCase()

  if (GA_HINTS.some((h) => name.includes(h)))
    return { assetType: 'GRAPHICAL_ABSTRACT', confidence: 0.95, reason: 'filename indicates graphical abstract' }

  if (COVER_HINTS.some((h) => name.includes(h)))
    return { assetType: 'COVER', confidence: 0.8, reason: 'filename indicates cover art' }

  if (SUPP_HINTS.some((h) => name.includes(h)))
    return { assetType: 'SUPPLEMENTARY', confidence: 0.85, reason: 'filename indicates supplementary material' }

  // Media and archives are supplementary regardless of name.
  if (VIDEO_MIME.test(mime) || ['zip', 'tar', 'gz', '7z', 'rar', 'mp4', 'mov', 'avi', 'wav', 'mp3'].includes(ext))
    return { assetType: 'SUPPLEMENTARY', confidence: 0.8, reason: `media/archive file (.${ext || mime})` }

  // Spreadsheets / delimited data: a "table" by name, otherwise supplementary data.
  if (['csv', 'tsv', 'xlsx', 'xls', 'ods'].includes(ext)) {
    if (TABLE_HINTS.some((h) => name.includes(h)))
      return { assetType: 'TABLE', confidence: 0.7, reason: 'tabular file named as a table' }
    return { assetType: 'SUPPLEMENTARY', confidence: 0.6, reason: 'tabular data file' }
  }

  if (IMAGE_MIME.test(mime) || ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'eps', 'svg', 'gif', 'webp'].includes(ext)) {
    if (TABLE_HINTS.some((h) => name.includes(h)))
      return { assetType: 'TABLE', confidence: 0.6, reason: 'image named as a table' }
    return { assetType: 'FIGURE', confidence: 0.7, reason: 'image file → figure (graphical-abstract candidate)' }
  }

  // Primary document formats → main manuscript, not an asset.
  if (DOC_MIME.test(mime) || ['doc', 'docx', 'odt', 'tex', 'md', 'pdf', 'rtf'].includes(ext)) {
    if (MAIN_HINTS.some((h) => name.includes(h)))
      return { assetType: null, confidence: 0.9, reason: 'primary manuscript document' }
    return { assetType: null, confidence: 0.5, reason: 'document treated as manuscript' }
  }

  return { assetType: 'SUPPLEMENTARY', confidence: 0.4, reason: 'unrecognized type → supplementary' }
}

// Ask the model which figure is the graphical abstract when filenames don't
// make it obvious. Returns the index into `candidates`, or -1 for none.
async function pickGraphicalAbstract(
  candidates: Array<{ file: IntakeFile; index: number }>,
): Promise<number> {
  const MAX = 6
  const subset = candidates.slice(0, MAX)
  const images = [] as Array<{ mediaType: string; base64: string }>
  for (const c of subset) {
    try {
      const buf = await downloadFromMinio(c.file.minioKey)
      // Skip oversized images to bound token cost.
      if (buf.length > 5 * 1024 * 1024) continue
      const mediaType = IMAGE_MIME.test(c.file.mimeType) ? c.file.mimeType : 'image/png'
      images.push({ mediaType, base64: buf.toString('base64') })
    } catch {
      /* unreadable image — ignore */
    }
  }
  if (!images.length) return -1

  const prompt =
    `You are classifying figures from a scholarly manuscript. A "graphical abstract" ` +
    `(a.k.a. visual abstract) is a single, self-contained image that summarizes the ` +
    `whole paper's key finding — typically a polished schematic/infographic, not a data ` +
    `plot, micrograph, or a single result panel. I am giving you ${images.length} images ` +
    `in order (index 0..${images.length - 1}). Return the index of the one that is the ` +
    `graphical abstract, or -1 if none qualifies. JSON shape: {"index": number}.`

  try {
    const res = await aiJSON<{ index: number }>(prompt, { images, maxTokens: 100 })
    const i = Number(res?.index)
    if (Number.isInteger(i) && i >= 0 && i < subset.length) return subset[i].index
  } catch {
    /* AI failed — fall back to no GA */
  }
  return -1
}

export async function intakeProcessor(job: Job) {
  const d = IntakeJobSchema.parse(job.data)

  const results = d.files.map((file) => ({ file, ...classify(file) }))

  // Enforce a single graphical abstract. If filenames yielded none, optionally
  // ask the vision model to nominate one from the figure candidates.
  let gaCount = results.filter((r) => r.assetType === 'GRAPHICAL_ABSTRACT').length

  if (gaCount === 0 && d.useVision && aiEnabled()) {
    const figureCandidates = results
      .map((r, index) => ({ r, index }))
      .filter((x) => x.r.assetType === 'FIGURE')
      .map((x) => ({ file: x.r.file, index: x.index }))

    if (figureCandidates.length > 0) {
      const gaIndex = await pickGraphicalAbstract(figureCandidates)
      if (gaIndex >= 0) {
        results[gaIndex].assetType = 'GRAPHICAL_ABSTRACT'
        results[gaIndex].confidence = 0.8
        results[gaIndex].reason = 'AI vision identified graphical abstract'
        gaCount = 1
      }
    }
  }

  // If multiple GAs slipped through, keep the highest-confidence one; demote the rest.
  if (gaCount > 1) {
    const gaEntries = results.filter((r) => r.assetType === 'GRAPHICAL_ABSTRACT')
    gaEntries.sort((a, b) => b.confidence - a.confidence)
    gaEntries.slice(1).forEach((r) => {
      r.assetType = 'FIGURE'
      r.reason = 'demoted: another file is the graphical abstract'
    })
  }

  const summary = { created: 0, updated: 0, manuscripts: 0, supplementary: 0, graphicalAbstract: 0 }

  for (const r of results) {
    if (r.assetType === null) {
      summary.manuscripts++
      continue
    }
    if (r.assetType === 'SUPPLEMENTARY') summary.supplementary++
    if (r.assetType === 'GRAPHICAL_ABSTRACT') summary.graphicalAbstract++

    const metadata = {
      intake: {
        classifiedAt: new Date().toISOString(),
        confidence: r.confidence,
        reason: r.reason,
      },
      // Flag files that must ride along with the final published deliverable.
      linkedToDeliverable: r.assetType === 'SUPPLEMENTARY' || r.assetType === 'GRAPHICAL_ABSTRACT',
    } as Prisma.InputJsonValue

    if (r.file.assetId) {
      await prisma.asset.update({
        where: { id: r.file.assetId },
        data:  { assetType: r.assetType, metadata },
      })
      summary.updated++
    } else {
      await prisma.asset.create({
        data: {
          submissionId:  d.submissionId,
          uploadedById:  r.file.uploadedById,
          filename:      r.file.filename,
          assetType:     r.assetType,
          minioKey:      r.file.minioKey,
          mimeType:      r.file.mimeType,
          fileSizeBytes: r.file.sizeBytes,
          status:        'PENDING',
          metadata,
        },
      })
      summary.created++
    }
  }

  await prisma.workflowLog.create({
    data: {
      submissionId: d.submissionId,
      toStatus:     'SUBMITTED',
      performedBy:  'SYSTEM',
      note:         'Intake classifier: separated supplementary & graphical-abstract files',
      metadata: {
        ...summary,
        classifications: results.map((r) => ({
          filename: r.file.filename,
          assetType: r.assetType ?? 'MANUSCRIPT',
          confidence: r.confidence,
        })),
      } as Prisma.InputJsonValue,
    },
  })

  return summary
}
