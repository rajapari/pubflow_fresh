// ── Issue Assembler Bot (Stage 12) ───────────────────────
// Compiles an issue-level PDF: a generated table of contents followed by
// every article's latest completed PDF in reading order (Submission.issueOrder,
// NULLs after ordered articles, ties broken by title). The ToC is typeset by
// the LaTeX service; concatenation happens in the preflight service's /merge
// (pikepdf). Result lands on Issue.compiledPdfKey.
import type { Job } from 'bullmq'
import { IssueAssemblyJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'

const LATEX_URL     = process.env.LATEX_SERVICE_URL     ?? 'http://localhost:5003'
const PREFLIGHT_URL = process.env.PREFLIGHT_SERVICE_URL ?? 'http://localhost:4200'

// Proper LaTeX escaping — titles are author-supplied free text. Single pass
// so replacement output (which contains braces) is never re-escaped.
const TEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
  '_': '\\_', '{': '\\{', '}': '\\}',
  '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
}
export function texEscape(s: string): string {
  return s.replace(/[\\&%$#_{}~^]/g, (ch) => TEX_ESCAPES[ch])
}

export interface TocEntry {
  title: string
  authors: string[]
  startPage: number
}

export interface TocMeta {
  publicationTitle: string
  volume: number | null
  number: number | null
  year: number
  issueTitle: string | null
}

/** Pure ToC document builder — exported for unit tests. */
export function buildTocLatex(meta: TocMeta, entries: TocEntry[]): string {
  const volNo = [
    meta.volume != null ? `Volume ${meta.volume}` : null,
    meta.number != null ? `Issue ${meta.number}` : null,
    String(meta.year),
  ].filter(Boolean).join(' · ')

  const rows = entries.map((e) => {
    const authors = e.authors.length ? `\\\\{\\small ${texEscape(e.authors.join(', '))}}` : ''
    return (
      `\\noindent\\parbox{0.82\\textwidth}{${texEscape(e.title)}${authors}}` +
      `\\hfill ${e.startPage}\\par\\vspace{0.9em}`
    )
  }).join('\n')

  return `\\documentclass[11pt]{article}
\\usepackage[a4paper,margin=2.5cm]{geometry}
\\usepackage{parskip}
\\pagestyle{empty}
\\begin{document}
\\begin{center}
{\\LARGE\\bfseries ${texEscape(meta.publicationTitle)}}\\\\[0.5em]
{\\large ${texEscape(volNo)}}${meta.issueTitle ? `\\\\[0.5em]{\\itshape ${texEscape(meta.issueTitle)}}` : ''}
\\end{center}
\\vspace{2em}
{\\large\\bfseries Contents}\\par\\vspace{1.5em}
${rows || '\\noindent (No articles)'}
\\end{document}
`
}

type OrderableSubmission = { issueOrder: number | null; title: string }
/** Reading-order comparator: issueOrder ascending, NULLs last, then title. */
export function compareIssueOrder(a: OrderableSubmission, b: OrderableSubmission): number {
  if (a.issueOrder != null && b.issueOrder != null) return a.issueOrder - b.issueOrder
  if (a.issueOrder != null) return -1
  if (b.issueOrder != null) return 1
  return a.title.localeCompare(b.title)
}

async function renderToc(meta: TocMeta, entries: TocEntry[]): Promise<Buffer> {
  const res = await fetch(`${LATEX_URL}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: buildTocLatex(meta, entries), engine: 'xelatex', passes: 1 }),
  })
  if (!res.ok) throw new Error(`ToC compilation failed: ${await res.text()}`)
  const body = await res.json() as { pdf: string }
  return Buffer.from(body.pdf, 'base64')
}

async function mergePdfs(parts: Buffer[]): Promise<{ pdf: Buffer; pageCount: number }> {
  const res = await fetch(`${PREFLIGHT_URL}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfs: parts.map((p) => p.toString('base64')) }),
  })
  if (!res.ok) throw new Error(`PDF merge failed: ${await res.text()}`)
  const body = await res.json() as { pdf: string; pageCount: number }
  return { pdf: Buffer.from(body.pdf, 'base64'), pageCount: body.pageCount }
}

export async function issueProcessor(job: Job) {
  const d = IssueAssemblyJobSchema.parse(job.data)

  try {
    const issue = await prisma.issue.findUniqueOrThrow({
      where: { id: d.issueId },
      include: {
        publication: { select: { title: true } },
        submissions: {
          select: {
            id: true, title: true, issueOrder: true, coAuthors: true,
            author: { select: { firstName: true, lastName: true } },
            outputs: {
              where: { format: d.pdfFormat, status: 'COMPLETED', minioKey: { not: '' } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    })

    const ordered = [...issue.submissions].sort(compareIssueOrder)
    const withPdf = ordered.filter((s) => s.outputs.length > 0)
    const skipped = ordered.filter((s) => s.outputs.length === 0).map((s) => s.title)

    if (withPdf.length === 0) {
      throw new Error(
        `No articles in this issue have a COMPLETED ${d.pdfFormat} output — run typesetting first`,
      )
    }

    // Download article PDFs in reading order.
    const articlePdfs: Buffer[] = []
    for (const s of withPdf) {
      articlePdfs.push(await downloadFromMinio(s.outputs[0].minioKey))
    }

    // ToC start pages need each article's page count before the ToC is
    // typeset. A single-part /merge returns exactly that count.
    const pageCounts: number[] = []
    for (const pdf of articlePdfs) {
      const single = await mergePdfs([pdf])
      pageCounts.push(single.pageCount)
    }
    let cursor = 2 // ToC occupies page 1
    const entries: TocEntry[] = withPdf.map((s, i) => {
      const co = Array.isArray(s.coAuthors)
        ? (s.coAuthors as Array<{ name?: string }>).map((c) => c?.name).filter((n): n is string => !!n)
        : []
      const lead = [s.author.firstName, s.author.lastName].filter(Boolean).join(' ')
      const entry: TocEntry = {
        title: s.title,
        authors: [lead, ...co].filter(Boolean),
        startPage: cursor,
      }
      cursor += pageCounts[i]
      return entry
    })

    const meta: TocMeta = {
      publicationTitle: issue.publication.title,
      volume: issue.volume,
      number: issue.number,
      year: issue.year,
      issueTitle: issue.title,
    }
    const tocPdf = await renderToc(meta, entries)
    const merged = await mergePdfs([tocPdf, ...articlePdfs])

    const key = `issues/${d.issueId}/issue-${d.pdfFormat.toLowerCase()}.pdf`
    await uploadToMinio(key, merged.pdf, 'application/pdf')

    await prisma.issue.update({
      where: { id: d.issueId },
      data: {
        compiledPdfKey: key,
        compiledAt: new Date(),
        compileError: skipped.length
          ? `Assembled without ${skipped.length} article(s) lacking a ${d.pdfFormat} PDF: ${skipped.join('; ')}`
          : null,
      },
    })

    return { key, pageCount: merged.pageCount, articles: withPdf.length, skipped: skipped.length }
  } catch (err) {
    await prisma.issue.update({
      where: { id: d.issueId },
      data: { compileError: String(err) },
    }).catch(() => { /* issue may not exist */ })
    throw err
  }
}
