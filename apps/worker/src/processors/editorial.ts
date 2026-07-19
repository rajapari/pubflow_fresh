// ── Editorial-intelligence bots (Phase C) ────────────────
// One processor, three job kinds routed on data.type:
//   SCREENING  — desk-triage advisory: scope fit vs the publication's aims,
//                quality red flags, paper-mill signals. Never auto-rejects.
//   REBUTTAL   — after resubmission: map each reviewer point to the revision,
//                list what remains unaddressed.
//   SIMILARITY — plagiarism-check adapter; runs only when a provider is
//                configured (COPYLEAKS_API_KEY), otherwise records 'skipped'.
// Every report is advisory, stored on the Submission in preflightReport shape
// ({ status, ..., ranAt }); AI paths degrade to 'skipped' without a key.
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { EditorialJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { aiEnabled, aiJSON } from '../lib/ai.js'

type Report = Record<string, unknown>

async function saveReport(
  submissionId: string,
  field: 'screeningReport' | 'rebuttalReport' | 'similarityReport',
  report: Report,
  note: string,
) {
  const stamped = { ...report, ranAt: new Date().toISOString() }
  await prisma.submission.update({
    where: { id: submissionId },
    data: { [field]: stamped as Prisma.InputJsonValue },
  })
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId }, select: { status: true },
  })
  await prisma.workflowLog.create({
    data: {
      submissionId,
      toStatus: sub.status,
      performedBy: 'SYSTEM',
      note,
      metadata: stamped as Prisma.InputJsonValue,
    },
  })
  return stamped
}

// ── SCREENING ────────────────────────────────────────────

interface ScreeningResult {
  scopeFit: 'in-scope' | 'borderline' | 'out-of-scope'
  scopeReason: string
  qualityFlags: string[]
  integrityFlags: string[]
  recommendation: 'proceed' | 'scrutinize' | 'consider-desk-reject'
}

async function runScreening(submissionId: string): Promise<Report> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: {
      title: true, abstract: true, keywords: true, coAuthors: true,
      author: { select: { affiliation: true } },
      publication: { select: { title: true, description: true, submissionGuidelines: true } },
    },
  })

  if (!aiEnabled()) {
    return { status: 'skipped', reason: 'AI not configured — screening requires ANTHROPIC_API_KEY' }
  }

  const system =
    'You are a desk-review triage assistant for a scholarly journal. You advise ' +
    'a human editor; you never decide. Be specific and conservative — flag only ' +
    'what the provided material actually supports.'
  const prompt =
    `Journal: "${sub.publication.title}". Aims & scope: ${sub.publication.description ?? '(none provided)'}\n` +
    (sub.publication.submissionGuidelines ? `Guidelines: ${sub.publication.submissionGuidelines}\n` : '') +
    `\nSubmission title: ${sub.title}\nKeywords: ${sub.keywords.join(', ')}\n` +
    `Abstract: ${sub.abstract ?? '(no abstract)'}\n` +
    `Author count: ${1 + (Array.isArray(sub.coAuthors) ? sub.coAuthors.length : 0)}\n\n` +
    `Assess: (1) scope fit; (2) quality red flags visible from title/abstract ` +
    `(vague claims, missing methods signal, salami-slicing); (3) integrity signals ` +
    `(paper-mill phrasing, tortured phrases, unrelated-author patterns). JSON shape: ` +
    `{"scopeFit":"in-scope"|"borderline"|"out-of-scope","scopeReason":string,` +
    `"qualityFlags":string[],"integrityFlags":string[],` +
    `"recommendation":"proceed"|"scrutinize"|"consider-desk-reject"}`

  try {
    const r = await aiJSON<ScreeningResult>(prompt, { system, maxTokens: 1024 })
    return { status: 'done', ...r }
  } catch (err) {
    return { status: 'error', error: String(err) }
  }
}

// ── REBUTTAL COVERAGE ────────────────────────────────────

interface RebuttalResult {
  points: Array<{ reviewer: number; point: string; addressed: 'yes' | 'partly' | 'no'; evidence: string }>
  unaddressedCount: number
  summary: string
}

async function runRebuttal(submissionId: string): Promise<Report> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: { title: true, revisionRound: true },
  })
  const reviews = await prisma.review.findMany({
    where: { submissionId, status: 'SUBMITTED', comments: { not: null } },
    orderBy: { submittedAt: 'asc' },
    select: { comments: true, round: true },
  })
  if (reviews.length === 0) {
    return { status: 'skipped', reason: 'No completed reviews with comments to check against' }
  }

  // The revision bot logs a paragraph-level diff on resubmission; reuse it as
  // the "what changed" evidence when present.
  const diffLog = await prisma.workflowLog.findFirst({
    where: { submissionId, note: { contains: 'Revision diff' } },
    orderBy: { createdAt: 'desc' },
  })

  if (!aiEnabled()) {
    return {
      status: 'skipped',
      reason: 'AI not configured — coverage mapping requires ANTHROPIC_API_KEY',
      reviewCount: reviews.length,
    }
  }

  const system =
    'You verify whether an author revision addresses peer-review comments. ' +
    'You advise the handling editor; be strict about evidence — if the diff ' +
    'shows no related change, the point is not addressed.'
  const diffSummary = diffLog ? JSON.stringify(diffLog.metadata).slice(0, 20_000) : '(no diff available)'
  const prompt =
    `Manuscript: "${sub.title}" (revision round ${sub.revisionRound}).\n\n` +
    reviews.map((r, i) => `--- Reviewer ${i + 1} (round ${r.round}) ---\n${r.comments}`).join('\n\n') +
    `\n\n--- Paragraph-level diff of the revision ---\n${diffSummary}\n\n` +
    `Extract each distinct actionable reviewer point (max 20) and judge coverage. ` +
    `JSON: {"points":[{"reviewer":n,"point":string,"addressed":"yes"|"partly"|"no",` +
    `"evidence":string}],"unaddressedCount":n,"summary":string}`

  try {
    const r = await aiJSON<RebuttalResult>(prompt, { system, maxTokens: 4096 })
    return { status: 'done', ...r }
  } catch (err) {
    return { status: 'error', error: String(err) }
  }
}

// ── SIMILARITY (provider adapter) ────────────────────────

async function runSimilarity(submissionId: string): Promise<Report> {
  void submissionId
  // Adapter seam: only Copyleaks is sketched; iThenticate/Crossref Similarity
  // Check slot in the same way. Without credentials the bot records exactly
  // why it did not run instead of failing the pipeline.
  if (!process.env.COPYLEAKS_API_KEY) {
    return {
      status: 'skipped',
      reason: 'No similarity provider configured (set COPYLEAKS_API_KEY)',
      provider: null,
    }
  }
  // Provider integration lands when credentials exist to test against —
  // submitting author manuscripts to a third party untested is not acceptable.
  return {
    status: 'skipped',
    reason: 'Copyleaks adapter present but provider integration not yet enabled',
    provider: 'copyleaks',
  }
}

// ── Router ───────────────────────────────────────────────

export async function editorialProcessor(job: Job) {
  const d = EditorialJobSchema.parse(job.data)
  switch (d.type) {
    case 'SCREENING':
      return saveReport(d.submissionId, 'screeningReport',
        await runScreening(d.submissionId), 'AI screening triage')
    case 'REBUTTAL':
      return saveReport(d.submissionId, 'rebuttalReport',
        await runRebuttal(d.submissionId), 'Rebuttal coverage check')
    case 'SIMILARITY':
      return saveReport(d.submissionId, 'similarityReport',
        await runSimilarity(d.submissionId), 'Similarity check')
  }
}
