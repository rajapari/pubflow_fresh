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
import { inflateRawSync } from 'zlib'
import { CorrectionApplyJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'

// ── Minimal ZIP reader/writer (no dependencies) ──────────────────────────────

interface ZipEntry { name: string; data: Buffer }

function readZip(buf: Buffer): ZipEntry[] {
  // Locate End Of Central Directory (scan back over optional comment)
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a ZIP file (no end-of-central-directory)')
  const count  = buf.readUInt16LE(eocd + 10)
  let offset   = buf.readUInt32LE(eocd + 16)
  const out: ZipEntry[] = []

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt central directory')
    const method      = buf.readUInt16LE(offset + 10)
    const compSize    = buf.readUInt32LE(offset + 20)
    const nameLen     = buf.readUInt16LE(offset + 28)
    const extraLen    = buf.readUInt16LE(offset + 30)
    const commentLen  = buf.readUInt16LE(offset + 32)
    const localOffset = buf.readUInt32LE(offset + 42)
    const name        = buf.toString('utf8', offset + 46, offset + 46 + nameLen)

    // Local header: name/extra lengths can differ from central copy
    const lNameLen  = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const raw       = buf.subarray(dataStart, dataStart + compSize)

    let data: Buffer
    if (method === 0)      data = Buffer.from(raw)
    else if (method === 8) data = inflateRawSync(raw)
    else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`)

    out.push({ name, data })
    offset += 46 + nameLen + extraLen + commentLen
  }
  return out
}

function crc32(buf: Buffer): number {
  const t: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  let crc = 0xffffffff
  for (const b of buf) crc = (crc >>> 8) ^ t[(crc ^ b) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = []
  let off = 0
  for (const { name, data } of entries) {
    const n = Buffer.from(name), c = crc32(data)
    const lh = Buffer.alloc(30 + n.length)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4)
    lh.writeUInt32LE(c, 14)
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(n.length, 26); n.copy(lh, 30)

    const ch = Buffer.alloc(46 + n.length)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6)
    ch.writeUInt32LE(c, 16)
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42); n.copy(ch, 46)

    locals.push(lh, data)
    centrals.push(ch)
    off += lh.length + data.length
  }
  const cdir = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdir.length, 12); eocd.writeUInt32LE(off, 16)
  return Buffer.concat([...locals, cdir, eocd])
}

// ── DOCX text patching ────────────────────────────────────────────────────────

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const encodeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

interface TextNode { outerStart: number; outerEnd: number; text: string }

/** All <w:t> nodes inside one string of document XML, in document order. */
function collectTextNodes(xml: string): TextNode[] {
  const nodes: TextNode[] = []
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    nodes.push({ outerStart: m.index, outerEnd: m.index + m[0].length, text: decodeXml(m[1]) })
  }
  return nodes
}

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
