// ── Correction Applier Bot (Stage 10) ────────────────────────────────────────
// Consumes ACCEPTED ProofCorrection rows for a submission and applies them to
// the latest DOCX manuscript:
//   REPLACE  targetText → newText
//   DELETE   targetText → ''
// Matching happens on the concatenated visible text of each paragraph, so a
// target split across DOCX runs (<w:r>/<w:t> boundaries from formatting or
// tracked-change history) is still found. Anything the bot cannot locate
// exactly ONCE is left ACCEPTED with an explanatory note — the bot never
// guesses. INSERT/MOVE/COMMENT/QUERY_ANSWER are inherently positional and are
// always routed to manual application.
//
// Output: a new numbered manuscript version (the proofed version stays
// immutable), APPLIED flags, a WorkflowLog entry, and a notification nudge to
// re-run typesetting.
import { Job } from 'bullmq'
import { CorrectionApplyJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'
import { readZip, writeZip, crc32, encodeXml, collectTextNodes } from '../lib/docx.js'
import type { TextNode } from '../lib/docx.js'

// ── DOCX text patching ────────────────────────────────────────────────────────

/**
 * Apply one replacement to the XML. Matches targetText against the
 * concatenation of all <w:t> contents (so run boundaries don't hide it), but
 * only when it occurs exactly once — ambiguity means manual application.
 * Returns the new XML, or null when not applicable.
 */
function applyOne(xml: string, targetText: string, newText: string):
  { xml: string } | { error: 'not-found' | 'ambiguous' } {
  const nodes = collectTextNodes(xml)
  const full  = nodes.map(n => n.text).join('')

  const first = full.indexOf(targetText)
  if (first < 0) return { error: 'not-found' }
  if (full.indexOf(targetText, first + 1) >= 0) return { error: 'ambiguous' }

  // Map the flat match back onto the nodes it spans
  const end = first + targetText.length
  let cursor = 0
  const patched: Array<{ node: TextNode; newContent: string }> = []
  for (const node of nodes) {
    const nStart = cursor, nEnd = cursor + node.text.length
    cursor = nEnd
    if (nEnd <= first || nStart >= end) continue
    const cutFrom = Math.max(first - nStart, 0)
    const cutTo   = Math.min(end - nStart, node.text.length)
    // The replacement text lands in the first affected node; later nodes just
    // lose their covered span (keeps runs and their formatting intact).
    const inject = nStart <= first ? newText : ''
    patched.push({ node, newContent: node.text.slice(0, cutFrom) + inject + node.text.slice(cutTo) })
  }

  // Rebuild XML back-to-front so recorded offsets stay valid
  let out = xml
  for (const p of [...patched].reverse()) {
    // xml:space="preserve" keeps leading/trailing spaces we may have created
    const replacement = `<w:t xml:space="preserve">${encodeXml(p.newContent)}</w:t>`
    out = out.slice(0, p.node.outerStart) + replacement + out.slice(p.node.outerEnd)
  }
  return { xml: out }
}

// ── Processor ─────────────────────────────────────────────────────────────────

export async function correctionProcessor(job: Job) {
  const data = CorrectionApplyJobSchema.parse(job.data)
  const { submissionId, requestedById } = data

  const corrections = await prisma.proofCorrection.findMany({
    where: { submissionId, status: 'ACCEPTED' },
    orderBy: { createdAt: 'asc' },
  })
  if (corrections.length === 0) return { applied: 0, manual: 0, skipped: 'no accepted corrections' }

  const manuscript = await prisma.manuscript.findFirst({
    where: { submissionId, isLatest: true },
    orderBy: { uploadedAt: 'desc' },
  })
  if (!manuscript) throw new Error(`No manuscript for submission ${submissionId}`)

  const flagManual = async (ids: string[], reason: string) => {
    for (const id of ids) {
      const c = corrections.find(x => x.id === id)!
      await prisma.proofCorrection.update({
        where: { id },
        data: { note: `${c.note ? c.note + ' — ' : ''}[bot] ${reason}` },
      })
    }
  }

  // Non-DOCX manuscripts: everything goes to manual application
  if (manuscript.format !== 'DOCX') {
    await flagManual(corrections.map(c => c.id), `manuscript is ${manuscript.format}; apply manually`)
    return { applied: 0, manual: corrections.length }
  }

  const docxBuf  = await downloadFromMinio(manuscript.minioKey)
  const entries  = readZip(docxBuf)
  const docEntry = entries.find(e => e.name === 'word/document.xml')
  if (!docEntry) throw new Error('word/document.xml missing from DOCX')

  let xml = docEntry.data.toString('utf8')
  const applied: string[] = []
  const manual: Array<{ id: string; reason: string }> = []

  for (const c of corrections) {
    if (c.kind === 'REPLACE' || c.kind === 'DELETE') {
      if (!c.targetText) { manual.push({ id: c.id, reason: 'no target text recorded' }); continue }
      const result = applyOne(xml, c.targetText, c.kind === 'DELETE' ? '' : (c.newText ?? ''))
      if ('xml' in result) {
        xml = result.xml
        applied.push(c.id)
      } else {
        manual.push({
          id: c.id,
          reason: result.error === 'not-found'
            ? 'target text not found in the manuscript'
            : 'target text appears more than once — apply manually to the right occurrence',
        })
      }
    } else {
      manual.push({ id: c.id, reason: `${c.kind} corrections are positional; apply manually` })
    }
  }

  if (applied.length > 0) {
    docEntry.data = Buffer.from(xml, 'utf8')
    const newDocx = writeZip(entries)

    // New numbered version; the proofed version stays immutable in history
    const filename = manuscript.minioKey.split('/').pop() ?? 'manuscript.docx'
    const sub      = await prisma.submission.findUniqueOrThrow({
      where: { id: submissionId }, select: { tenantId: true },
    })
    const hash   = crc32(newDocx).toString(16).padStart(8, '0')
    const newKey = `${sub.tenantId}/${submissionId}/corrected-${Date.now()}-${hash}-${filename}`
    await uploadToMinio(newKey, newDocx,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    await prisma.$transaction([
      prisma.manuscript.updateMany({
        where: { submissionId, isLatest: true },
        data: { isLatest: false },
      }),
      prisma.manuscript.create({
        data: {
          submissionId,
          format:        'DOCX',
          minioPath:     `s3://pubflow-files/${newKey}`,
          minioKey:      newKey,
          fileSizeBytes: newDocx.length,
          version:       manuscript.version + 1,
          isLatest:      true,
        },
      }),
      prisma.proofCorrection.updateMany({
        where: { id: { in: applied } },
        data: { status: 'APPLIED', resolvedAt: new Date() },
      }),
      prisma.workflowLog.create({
        data: {
          submissionId,
          toStatus:    'TYPESETTING',
          fromStatus:  null,
          performedBy: 'SYSTEM',
          note: `Correction bot: applied ${applied.length} correction(s) as manuscript v${manuscript.version + 1}` +
                (manual.length ? `; ${manual.length} left for manual application` : '') +
                ` (requested by ${requestedById})`,
          metadata: { applied, manual },
        },
      }),
    ])
  }

  if (manual.length > 0) {
    for (const m of manual) await flagManual([m.id], m.reason)
  }

  return { applied: applied.length, manual: manual.length, newVersion: applied.length > 0 ? manuscript.version + 1 : undefined }
}
