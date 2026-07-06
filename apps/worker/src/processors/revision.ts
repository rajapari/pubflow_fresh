// ── Revision Diff Bot (Stage 3) ──────────────────────────────────────────────
// Runs when the author resubmits a revision (transition → REVISED). Compares
// the manuscript version the reviewers saw against the author's revised
// version at paragraph granularity (LCS), so editors and reviewers can judge
// each of the maximum three revision rounds at a glance instead of re-reading
// the whole manuscript.
//
// Output: JSON report in MinIO (revision-diffs/{submissionId}/v{a}-v{b}.json)
// plus a SYSTEM WorkflowLog entry summarizing words added/removed and
// paragraphs added/removed/modified.
import type { Job } from 'bullmq'
import { RevisionDiffJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'
import { extractParagraphs } from '../lib/docx.js'

interface DiffOp { op: 'added' | 'removed' | 'modified'; index: number; text?: string; oldText?: string; newText?: string }

/** Paragraph-level LCS diff. Guards against quadratic blowup on huge docs. */
export function diffParagraphs(a: string[], b: string[]): DiffOp[] | null {
  if (a.length * b.length > 4_000_000) return null // too large for exact LCS

  // Standard LCS table
  const n = a.length, m = b.length
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  const ops: DiffOp[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: 'removed', index: i, text: a[i] }); i++ }
    else { ops.push({ op: 'added', index: j, text: b[j] }); j++ }
  }
  while (i < n) { ops.push({ op: 'removed', index: i, text: a[i] }); i++ }
  while (j < m) { ops.push({ op: 'added', index: j, text: b[j] }); j++ }

  // Pair adjacent removed+added into "modified" for readability
  const merged: DiffOp[] = []
  for (let k = 0; k < ops.length; k++) {
    const cur = ops[k], nxt = ops[k + 1]
    if (cur.op === 'removed' && nxt?.op === 'added') {
      merged.push({ op: 'modified', index: nxt.index, oldText: cur.text, newText: nxt.text })
      k++
    } else merged.push(cur)
  }
  return merged
}

const words = (s: string | undefined) => (s ?? '').trim() === '' ? 0 : (s ?? '').trim().split(/\s+/).length

export async function revisionProcessor(job: Job) {
  const d = RevisionDiffJobSchema.parse(job.data)

  const versions = await prisma.manuscript.findMany({
    where: { submissionId: d.submissionId },
    orderBy: { version: 'desc' },
    take: 10,
  })
  const to   = d.toVersion   ? versions.find(v => v.version === d.toVersion)   : versions[0]
  const from = d.fromVersion ? versions.find(v => v.version === d.fromVersion) : versions[1]
  if (!from || !to || from.id === to.id) {
    console.info(`[revision-diff] ${d.submissionId}: fewer than two versions — nothing to diff`)
    return { skipped: 'need two versions' }
  }
  if (from.format !== 'DOCX' || to.format !== 'DOCX') {
    console.info(`[revision-diff] ${d.submissionId}: ${from.format}/${to.format} — only DOCX supported`)
    return { skipped: 'non-DOCX versions' }
  }

  const [bufA, bufB] = await Promise.all([
    downloadFromMinio(from.minioKey),
    downloadFromMinio(to.minioKey),
  ])
  const parsA = extractParagraphs(bufA)
  const parsB = extractParagraphs(bufB)

  const ops = diffParagraphs(parsA, parsB)
  const stats = {
    fromVersion: from.version, toVersion: to.version,
    paragraphsBefore: parsA.length, paragraphsAfter: parsB.length,
    added: 0, removed: 0, modified: 0, wordsAdded: 0, wordsRemoved: 0,
    exact: ops !== null,
  }
  if (ops) {
    for (const op of ops) {
      if (op.op === 'added')    { stats.added++;    stats.wordsAdded   += words(op.text) }
      if (op.op === 'removed')  { stats.removed++;  stats.wordsRemoved += words(op.text) }
      if (op.op === 'modified') {
        stats.modified++
        const dw = words(op.newText) - words(op.oldText)
        if (dw > 0) stats.wordsAdded += dw; else stats.wordsRemoved += -dw
      }
    }
  } else {
    // Document too large for exact diff — coarse word-count summary only
    const wa = parsB.join(' '), wb = parsA.join(' ')
    stats.wordsAdded   = Math.max(words(wa) - words(wb), 0)
    stats.wordsRemoved = Math.max(words(wb) - words(wa), 0)
  }

  const reportKey = `revision-diffs/${d.submissionId}/v${from.version}-v${to.version}.json`
  await uploadToMinio(reportKey,
    Buffer.from(JSON.stringify({ stats, ops: ops ?? [] }, null, 2)),
    'application/json')

  const summary =
    `Revision diff v${from.version}→v${to.version}: ` +
    `+${stats.wordsAdded}/−${stats.wordsRemoved} words, ` +
    `${stats.added} added / ${stats.removed} removed / ${stats.modified} modified paragraph(s)` +
    (stats.exact ? '' : ' (approximate — document too large for exact diff)')

  await prisma.workflowLog.create({
    data: {
      submissionId: d.submissionId,
      toStatus:     'REVISED',
      fromStatus:   null,
      performedBy:  'SYSTEM',
      note:         summary,
      metadata:     { reportKey, stats } as object,
    },
  })

  console.info(`✅ [revision-diff] ${summary}`)
  return { summary, reportKey, stats }
}
