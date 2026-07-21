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

/** Email every active tenant user holding one of the given roles. */
async function notifyRole(
  prisma: PrismaClient,
  queues: Queues,
  submissionId: string,
  roles: string[],
  template: 'COPY_EDIT_ASSIGNED' | 'PROOF_READY',
): Promise<void> {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { title: true, tenantId: true },
  })
  if (!sub) return
  const staff = await prisma.user.findMany({
    where: { tenantId: sub.tenantId, role: { in: roles as any }, status: 'ACTIVE' },
    select: { email: true },
  })
  if (staff.length === 0) return
  await queues[QUEUES.NOTIFICATION].add(`stage-alert-${roles[0].toLowerCase()}`, {
    type: 'NOTIFICATION',
    to: staff.map(s => s.email),
    template,
    data: { submissionId, title: sub.title },
  })
}

export async function dispatchStageBots(
  prisma: PrismaClient,
  queues: Queues,
  submissionId: string,
  toStatus: SubmissionStatus,
): Promise<void> {
  try {
    switch (toStatus) {
      // On submission: run the format & completeness checker, then classify
      // the uploaded bundle — separate supplementary material and the
      // graphical abstract so they follow the deliverable.
      case 'SUBMITTED': {
        // Completeness first: it has no asset dependency, so it must run even
        // for create-in-editor submissions that uploaded nothing.
        await queues[QUEUES.INTAKE].add('completeness-check', {
          type: 'COMPLETENESS',
          submissionId,
        })

        // Phase C: AI desk-triage + similarity check (both degrade to a
        // 'skipped' report when no AI key / provider is configured).
        await queues[QUEUES.EDITORIAL].add('screening', { type: 'SCREENING', submissionId })
        await queues[QUEUES.EDITORIAL].add('similarity', { type: 'SIMILARITY', submissionId })

        // Compliance: ethics/funding/COI plausibility, data-availability link
        // checks, and the license/copyright completeness gate.
        await queues[QUEUES.COMPLIANCE].add('ethics', { type: 'ETHICS', submissionId })
        await queues[QUEUES.COMPLIANCE].add('data-availability', { type: 'DATA_AVAILABILITY', submissionId })
        await queues[QUEUES.COMPLIANCE].add('license', { type: 'LICENSE', submissionId })

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

      // Author resubmitted a revision: diff the reviewed version against the
      // revised version so editors/reviewers see what changed this round.
      case 'REVISED': {
        await queues[QUEUES.REVISION].add('revision-diff', {
          type: 'REVISION_DIFF',
          submissionId,
        })
        // Phase C: verify every reviewer point was addressed (uses the diff
        // the revision bot just produced, so it runs on the same transition).
        await queues[QUEUES.EDITORIAL].add('rebuttal', { type: 'REBUTTAL', submissionId })
        break
      }

      // Entering copyediting: alert the tenant's copy editors that a
      // manuscript is waiting for assignment.
      case 'COPY_EDITING': {
        await notifyRole(prisma, queues, submissionId, ['COPY_EDITOR'], 'COPY_EDIT_ASSIGNED')
        break
      }

      // Entering artwork processing: run Image QA (DPI, color mode, metadata,
      // thumbnails) over every visual asset so the artwork editor starts from
      // a validation report instead of opening each file blind.
      case 'ARTWORK_PROCESSING': {
        const images = await prisma.asset.findMany({
          where: {
            submissionId,
            assetType: { in: ['FIGURE', 'GRAPHICAL_ABSTRACT', 'COVER'] },
          },
          select: { id: true, minioKey: true },
        })
        for (const img of images) {
          await queues[QUEUES.IMAGE].add('artwork-qa', {
            type: 'IMAGE',
            assetId: img.id,
            submissionId,
            inputMinioKey: img.minioKey,
            tasks: ['VALIDATE_DPI', 'VALIDATE_COLORMODE', 'EXTRACT_METADATA', 'GENERATE_THUMBNAIL'],
            targetDpi: 300,
          })
        }
        await notifyRole(prisma, queues, submissionId, ['ARTWORK_EDITOR'], 'COPY_EDIT_ASSIGNED')

        // Phase D: draft accessibility alt-text for assets the author left
        // blank (vision AI; skips cleanly without a key).
        const blankAlt = await prisma.asset.findMany({
          where: {
            submissionId,
            assetType: { in: ['FIGURE', 'GRAPHICAL_ABSTRACT', 'COVER'] },
            OR: [{ altText: null }, { altText: '' }],
          },
          select: { id: true },
        })
        for (const a of blankAlt) {
          await queues[QUEUES.MARKETING].add('alt-text', {
            type: 'ALT_TEXT', submissionId, assetId: a.id,
          })
        }
        break
      }

      // Entering typesetting: alert typesetters. Composition itself stays a
      // human action (engine/template choice via typesetting.triggerJob).
      case 'TYPESETTING': {
        await notifyRole(prisma, queues, submissionId, ['TYPESETTER'], 'COPY_EDIT_ASSIGNED')
        break
      }

      // Entering proof review: the proof is ready — tell the author, the
      // editors, and the proofreaders.
      case 'PROOF_REVIEW': {
        const sub = await prisma.submission.findUnique({
          where: { id: submissionId },
          include: { author: { select: { email: true } } },
        })
        if (sub?.author?.email) {
          await queues[QUEUES.NOTIFICATION].add('proof-ready-author', {
            type: 'NOTIFICATION', to: [sub.author.email], template: 'PROOF_READY',
            data: { submissionId, title: sub.title },
          })
        }
        await notifyRole(prisma, queues, submissionId, ['PROOF_READER', 'EDITOR_IN_CHIEF'], 'PROOF_READY')
        break
      }

      // Published: build the promotion kit (lay summary, social drafts, SEO
      // tags) and record archival-deposit status.
      case 'PUBLISHED': {
        await queues[QUEUES.MARKETING].add('promo-kit', { type: 'PROMO_KIT', submissionId })
        await queues[QUEUES.MARKETING].add('archival', { type: 'ARCHIVAL', submissionId })
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
