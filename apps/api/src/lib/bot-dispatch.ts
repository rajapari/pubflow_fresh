// ── Stage-bot orchestrator ───────────────────────────────
// Central dispatch: whenever a submission transitions status, enqueue the
// bots that own that stage. Keeps stage automation in one place instead of
// scattering queue.add() calls across routers.
//
// Dispatch is intentionally best-effort: a bot failing to enqueue must never
// block the editorial transition itself.
import type { Queue } from 'bullmq'
import type { QueueName, SubmissionStatus } from '@pubflow/types'
import { QUEUES } from '@pubflow/types'
import type { PrismaClient } from '@pubflow/db'

type Queues = Record<QueueName, Queue>

export async function dispatchStageBots(
  prisma: PrismaClient,
  queues: Queues,
  submissionId: string,
  toStatus: SubmissionStatus,
): Promise<void> {
  try {
    switch (toStatus) {
      // On submission: classify the uploaded bundle — separate supplementary
      // material and the graphical abstract so they follow the deliverable.
      case 'SUBMITTED': {
        const assets = await prisma.asset.findMany({
          where: { submissionId },
          select: {
            id: true, minioKey: true, filename: true,
            mimeType: true, fileSizeBytes: true, uploadedById: true,
          },
        })
        if (assets.length === 0) return
        await queues[QUEUES.INTAKE].add('classify-intake', {
          type: 'INTAKE',
          submissionId,
          useVision: true,
          files: assets.map((a) => ({
            assetId: a.id,
            minioKey: a.minioKey,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.fileSizeBytes,
            uploadedById: a.uploadedById,
          })),
        })
        break
      }
      default:
        break
    }
  } catch (err) {
    // Never let bot dispatch break the workflow transition.
    console.error(`[bot-dispatch] Failed for ${submissionId} → ${toStatus}:`, err)
  }
}

/**
 * Auto-run the style-manual bot when a copyeditor is assigned. Resolves the
 * publication/tenant default StyleProfile; falls back to in-house style.
 */
export async function dispatchCopyEditStyleBot(
  prisma: PrismaClient,
  queues: Queues,
  params: {
    copyEditId: string
    submissionId: string
    tenantId: string
    publicationId: string
  },
): Promise<void> {
  try {
    const manuscript = await prisma.manuscript.findFirst({
      where: { submissionId: params.submissionId, isLatest: true },
    })
    if (!manuscript) return

    const FORMAT_MAP: Record<string, 'docx' | 'markdown' | 'latex' | 'odt'> = {
      DOCX: 'docx', LATEX: 'latex', MARKDOWN: 'markdown', ODT: 'odt',
    }
    const inputFormat = FORMAT_MAP[manuscript.format]
    if (!inputFormat) return // PDF/RTF/ZIP manuscripts: bot can't analyze these

    const profile = await prisma.styleProfile.findFirst({
      where: {
        tenantId: params.tenantId,
        isDefault: true,
        OR: [{ publicationId: params.publicationId }, { publicationId: null }],
      },
      orderBy: { publicationId: { sort: 'desc', nulls: 'last' } },
    })

    await queues[QUEUES.COPYEDIT].add('style-bot', {
      type: 'COPYEDIT',
      submissionId: params.submissionId,
      copyEditId: params.copyEditId,
      inputMinioKey: manuscript.minioKey,
      inputFormat,
      styleProfileId: profile?.id,
      styleManual: profile?.manual ?? 'INHOUSE',
      cslStyle: profile?.cslStyle ?? 'apa',
      houseRules: [],
      applyAi: true,
    })
  } catch (err) {
    console.error(`[bot-dispatch] Copyedit style bot failed for ${params.copyEditId}:`, err)
  }
}
