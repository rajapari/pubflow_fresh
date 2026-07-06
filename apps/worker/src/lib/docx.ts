// ── Dependency-free DOCX (ZIP + WordprocessingML) helpers ────────────────────
// Shared by the correction applier, completeness checker, and revision diff
// bots. A DOCX is a ZIP; visible text lives in <w:t> nodes grouped into
// <w:p> paragraphs inside word/document.xml.
import { inflateRawSync } from 'zlib'

export interface ZipEntry { name: string; data: Buffer }

export function readZip(buf: Buffer): ZipEntry[] {
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

export function crc32(buf: Buffer): number {
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

export function writeZip(entries: ZipEntry[]): Buffer {
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

export const decodeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
export const encodeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export interface TextNode { outerStart: number; outerEnd: number; text: string }

/** All <w:t> nodes inside one string of document XML, in document order. */
export function collectTextNodes(xml: string): TextNode[] {
  const nodes: TextNode[] = []
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    nodes.push({ outerStart: m.index, outerEnd: m.index + m[0].length, text: decodeXml(m[1]) })
  }
  return nodes
}

/** Extract document.xml from a DOCX buffer, or throw. */
export function getDocumentXml(docx: Buffer): string {
  const entry = readZip(docx).find(e => e.name === 'word/document.xml')
  if (!entry) throw new Error('word/document.xml missing from DOCX')
  return entry.data.toString('utf8')
}

/** Visible text of a DOCX, one string per <w:p> paragraph (empty ones dropped). */
export function extractParagraphs(docx: Buffer): string[] {
  const xml = getDocumentXml(docx)
  const paragraphs: string[] = []
  const pRe = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g
  let m: RegExpExecArray | null
  while ((m = pRe.exec(xml)) !== null) {
    const text = collectTextNodes(m[1]).map(n => n.text).join('')
    if (text.trim().length > 0) paragraphs.push(text)
  }
  return paragraphs
}
