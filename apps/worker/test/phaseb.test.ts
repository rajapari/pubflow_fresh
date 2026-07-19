// Phase B — XML/EPUB Validator (Stage 11) + Issue Assembler (Stage 12).
// The xmlvalidate and preflight services run locally (python server.py);
// only the LaTeX ToC compile is stubbed (no local TeX) — its stub still
// returns a real PDF so the downstream /merge is exercised for real.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import type { Job } from 'bullmq'
import { xmlvalidateProcessor } from '../src/processors/xmlvalidate.js'
import {
  issueProcessor, buildTocLatex, compareIssueOrder, texEscape,
} from '../src/processors/issue.js'
import { prisma } from '../src/lib/prisma.js'
import { downloadFromMinio } from '../src/lib/storage.js'
import { createFixture, uploadFixture, type Fixture } from './helpers.js'

const GOOD_JATS = `<?xml version="1.0"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="1.3">
  <front>
    <journal-meta><journal-id>j</journal-id></journal-meta>
    <article-meta>
      <title-group><article-title>Valid Article</article-title></title-group>
      <contrib-group><contrib/></contrib-group>
      <abstract><p>Enough.</p></abstract>
    </article-meta>
  </front>
  <body><p>Text.</p></body>
</article>`

// A real minimal PDF, built with pikepdf so /merge accepts it.
function makePdf(pages: number): Buffer {
  const b64 = execSync(
    `python -c "import base64,io,pikepdf; p=pikepdf.new(); [p.add_blank_page(page_size=(595,842)) for _ in range(${pages})]; b=io.BytesIO(); p.save(b); print(base64.b64encode(b.getvalue()).decode())"`,
    { encoding: 'utf-8' },
  ).trim()
  return Buffer.from(b64, 'base64')
}

describe('ToC building (pure)', () => {
  it('texEscape neutralizes LaTeX specials without dropping text', () => {
    expect(texEscape('C&A: 100% of $x_i^2 #{}')).toBe(
      'C\\&A: 100\\% of \\$x\\_i\\textasciicircum{}2 \\#\\{\\}',
    )
    expect(texEscape('back\\slash')).toBe('back\\textbackslash{}slash')
  })

  it('compareIssueOrder: ordered first, NULLs after, title tiebreak', () => {
    const rows = [
      { issueOrder: null, title: 'Zeta' },
      { issueOrder: 2, title: 'B' },
      { issueOrder: null, title: 'Alpha' },
      { issueOrder: 1, title: 'A' },
    ]
    expect(rows.sort(compareIssueOrder).map((r) => r.title)).toEqual(['A', 'B', 'Alpha', 'Zeta'])
  })

  it('buildTocLatex renders header, entries in order, and start pages', () => {
    const tex = buildTocLatex(
      { publicationTitle: 'Journal of Tests & Trials', volume: 12, number: 3, year: 2026, issueTitle: 'Special: 50% Better' },
      [
        { title: 'First Article', authors: ['Jane Doe', 'Ko Li'], startPage: 2 },
        { title: 'Second_Article', authors: [], startPage: 7 },
      ],
    )
    expect(tex).toContain('Journal of Tests \\& Trials')
    expect(tex).toContain('Volume 12 · Issue 3 · 2026')
    expect(tex).toContain('Special: 50\\% Better')
    expect(tex.indexOf('First Article')).toBeLessThan(tex.indexOf('Second\\_Article'))
    expect(tex).toContain('\\hfill 2\\par')
    expect(tex).toContain('\\hfill 7\\par')
    expect(tex).toContain('Jane Doe, Ko Li')
  })
})

describe('xmlvalidateProcessor (live service, JATS)', () => {
  let fx: Fixture
  beforeAll(async () => { fx = await createFixture('xmlval') })
  afterAll(async () => { await fx.cleanup() })

  async function makeOutput(content: string) {
    const key = await uploadFixture(`test-fixtures/${randomUUID()}/article.xml`, content, 'application/xml')
    const output = await prisma.output.create({
      data: {
        submissionId: fx.submissionId, format: 'JATS_XML', engine: 'PANDOC',
        minioKey: key, status: 'COMPLETED',
      },
    })
    return { key, output }
  }

  it('valid JATS → pass report on the Output + workflow log', async () => {
    const { key, output } = await makeOutput(GOOD_JATS)
    const report = await xmlvalidateProcessor({
      data: { type: 'XMLVALIDATE', submissionId: fx.submissionId, outputId: output.id, kind: 'jats', inputMinioKey: key },
    } as Job)
    expect(report.status).toBe('pass')

    const reloaded = await prisma.output.findUniqueOrThrow({ where: { id: output.id } })
    const stored = reloaded.validationReport as { status: string; ranAt: string }
    expect(stored.status).toBe('pass')
    expect(stored.ranAt).toBeTruthy()

    const log = await prisma.workflowLog.findFirst({
      where: { submissionId: fx.submissionId, note: { contains: 'JATS validation' } },
    })
    expect(log).toBeTruthy()
  })

  it('broken JATS → fail report persisted, processor resolves (not a job failure)', async () => {
    const { key, output } = await makeOutput('<html><body>nope</body></html>')
    const report = await xmlvalidateProcessor({
      data: { type: 'XMLVALIDATE', submissionId: fx.submissionId, outputId: output.id, kind: 'jats', inputMinioKey: key },
    } as Job)
    expect(report.status).toBe('fail')
  })

  it('missing file → error report persisted and job throws for retry', async () => {
    const output = await prisma.output.create({
      data: {
        submissionId: fx.submissionId, format: 'JATS_XML', engine: 'PANDOC',
        minioKey: 'test-fixtures/gone.xml', status: 'COMPLETED',
      },
    })
    await expect(xmlvalidateProcessor({
      data: { type: 'XMLVALIDATE', submissionId: fx.submissionId, outputId: output.id, kind: 'jats', inputMinioKey: 'test-fixtures/gone.xml' },
    } as Job)).rejects.toThrow()
    const reloaded = await prisma.output.findUniqueOrThrow({ where: { id: output.id } })
    expect((reloaded.validationReport as { status: string }).status).toBe('error')
  })
})

describe('issueProcessor (live merge, stubbed LaTeX)', () => {
  let fx: Fixture
  let issueId: string
  const realFetch = globalThis.fetch

  beforeAll(async () => {
    fx = await createFixture('issue')
    const issue = await prisma.issue.create({
      data: {
        publicationId: fx.publicationId, volume: 1, number: 2, year: 2026,
        title: 'Assembler Test Issue',
      },
    })
    issueId = issue.id

    // Stub ONLY the LaTeX compile; everything else uses the real services.
    const tocPdf = makePdf(1).toString('base64')
    vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/compile')) {
        return Promise.resolve(new Response(JSON.stringify({ pdf: tocPdf }), { status: 200 }))
      }
      return realFetch(input as never, init)
    }) as typeof fetch)
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    await prisma.issue.deleteMany({ where: { id: issueId } })
    await fx.cleanup()
  })

  async function addArticle(title: string, issueOrder: number | null, pdfPages: number | null) {
    const sub = await prisma.submission.create({
      data: {
        tenantId: fx.tenantId, publicationId: fx.publicationId, authorId: fx.authorId,
        title, keywords: ['t'], status: 'PUBLISHED', issueId, issueOrder,
        coAuthors: [{ name: 'Co Author', email: 'co@test.local' }],
      },
    })
    if (pdfPages != null) {
      const key = await uploadFixture(`test-fixtures/${randomUUID()}/a.pdf`, makePdf(pdfPages), 'application/pdf')
      await prisma.output.create({
        data: { submissionId: sub.id, format: 'PDF_WEB', engine: 'PANDOC', minioKey: key, status: 'COMPLETED' },
      })
    }
    return sub
  }

  it('assembles ToC + ordered articles into one PDF and records skips', async () => {
    await addArticle('Beta article with sufficient title', 2, 3)
    await addArticle('Alpha article with sufficient title', 1, 2)
    await addArticle('Gamma article missing its PDF file', null, null)

    const result = await issueProcessor({
      data: { type: 'ISSUE_ASSEMBLY', issueId, pdfFormat: 'PDF_WEB' },
    } as Job)

    // 1 ToC page + 2 + 3 article pages
    expect(result.pageCount).toBe(6)
    expect(result.articles).toBe(2)
    expect(result.skipped).toBe(1)

    const issue = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })
    expect(issue.compiledPdfKey).toBe(result.key)
    expect(issue.compiledAt).toBeTruthy()
    expect(issue.compileError).toMatch(/Gamma article/)

    const pdf = await downloadFromMinio(result.key)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('fails clearly when no article has the requested PDF flavor', async () => {
    await expect(issueProcessor({
      data: { type: 'ISSUE_ASSEMBLY', issueId, pdfFormat: 'PDF_PRINT' },
    } as Job)).rejects.toThrow(/No articles.*PDF_PRINT/)
    const issue = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })
    expect(issue.compileError).toMatch(/PDF_PRINT/)
  })
})
