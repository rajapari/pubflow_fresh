// Stage 4 — Template porting: generators (Scribus SLA + LaTeX class),
// LaTeX geometry sniffing, the class-name invariant, and processor paths
// (IDML end-to-end via the live extractor service, LaTeX passthrough,
// INDD/PDF rejection).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { Job } from 'bullmq'
import { normalizeTemplateClassName } from '@pubflow/types'
import {
  generateScribusSla, generateLatexClass, type LayoutSpec,
} from '../src/lib/template-gen.js'
import { sniffLatexSpec, templateProcessor } from '../src/processors/template.js'
import { prisma } from '../src/lib/prisma.js'
import { downloadFromMinio } from '../src/lib/storage.js'
import { createFixture, uploadFixture, type Fixture } from './helpers.js'

const SPEC: LayoutSpec = {
  units: 'pt',
  pageWidth: 595.28, pageHeight: 841.89, facingPages: true,
  marginTop: 56.7, marginBottom: 70.9, marginLeft: 51, marginRight: 51,
  bleedTop: 8.5, bleedBottom: 8.5, bleedInside: 8.5, bleedOutside: 8.5,
  columnCount: 2, columnGutter: 14.2,
  fonts: ['Minion Pro', 'Myriad Pro'],
  colors: [
    { name: 'JournalBlue', space: 'CMYK', values: [100, 60, 0, 10] },
    { name: 'AccentRed', space: 'RGB', values: [200, 30, 45] },
  ],
  paragraphStyles: [
    { name: 'Body Text', fontFamily: 'Minion Pro', fontSize: 9.5, leading: 12, alignment: 'LeftJustified', spaceAfter: 4, firstLineIndent: 14 },
    { name: 'Heading 1', fontFamily: 'Myriad Pro', fontSize: 18, leading: 21.6, alignment: 'CenterAlign' },
  ],
  characterStyles: [{ name: 'Emphasis', fontFamily: 'Minion Pro Italic', fontSize: 9.5 }],
}

describe('generateScribusSla', () => {
  const sla = generateScribusSla(SPEC, 'Journal <Template> & "Layout"')

  it('produces well-formed XML even with hostile template names', () => {
    expect(XMLValidator.validate(sla)).toBe(true)
  })

  it('carries geometry, columns, colors and styles', () => {
    const doc = new XMLParser({ ignoreAttributes: false }).parse(sla)
    const d = doc.SCRIBUSUTF8NEW.DOCUMENT
    expect(Number(d['@_PAGEWIDTH'])).toBeCloseTo(595.28)
    expect(Number(d['@_PAGEHEIGHT'])).toBeCloseTo(841.89)
    expect(Number(d['@_BORDERTOP'])).toBeCloseTo(56.7)
    expect(Number(d['@_AUTOSPALTEN'])).toBe(2)
    expect(Number(d['@_BleedTop'])).toBeCloseTo(8.5)

    const colors = Array.isArray(d.COLOR) ? d.COLOR : [d.COLOR]
    const blue = colors.find((c: any) => c['@_NAME'] === 'JournalBlue')
    expect(blue['@_SPACE']).toBe('CMYK')
    expect(Number(blue['@_C'])).toBe(100)
    const red = colors.find((c: any) => c['@_NAME'] === 'AccentRed')
    expect(red['@_RGB']).toBe('#c81e2d')

    const styles = Array.isArray(d.STYLE) ? d.STYLE : [d.STYLE]
    const body = styles.find((s: any) => s['@_NAME'] === 'Body Text')
    expect(body['@_FONT']).toBe('Minion Pro')
    expect(Number(body['@_ALIGN'])).toBe(3) // LeftJustified → justify
    const h1 = styles.find((s: any) => s['@_NAME'] === 'Heading 1')
    expect(Number(h1['@_ALIGN'])).toBe(1) // CenterAlign → center

    // Main text frame spans the type area
    const frame = d.PAGEOBJECT
    expect(Number(frame['@_WIDTH'])).toBeCloseTo(595.28 - 51 - 51, 1)
    expect(Number(frame['@_COLUMNS'])).toBe(2)
  })
})

describe('generateLatexClass', () => {
  const cls = generateLatexClass(SPEC, 'Journal of Testing 2026')

  it('declares the class with the shared normalized name', () => {
    expect(cls).toContain(`\\ProvidesClass{${normalizeTemplateClassName('Journal of Testing 2026')}}`)
    expect(cls).toContain('\\ProvidesClass{journaloftesting}')
  })

  it('ports geometry, colors, columns and style macros', () => {
    expect(cls).toContain('paperwidth=595.28pt')
    expect(cls).toContain('paperheight=841.89pt')
    expect(cls).toContain('top=56.7pt')
    expect(cls).toContain('twoside')
    expect(cls).toContain('\\definecolor{JournalBlue}{cmyk}{1.000,0.600,0.000,0.100}')
    expect(cls).toContain('\\definecolor{AccentRed}{RGB}{200,30,45}')
    expect(cls).toContain('\\RequirePackage{multicol}')
    expect(cls).toContain('\\setlength{\\columnsep}{14.2pt}')
    expect(cls).toContain('\\newcommand{\\styleBodyText}')
    expect(cls).toContain('\\newcommand{\\styleHeading}') // digits stripped: "Heading 1" → Heading
  })

  it('single-column spec omits multicol', () => {
    const single = generateLatexClass({ ...SPEC, columnCount: 1 }, 'Mono')
    expect(single).not.toContain('multicol')
  })

  it('normalizer invariant: generator, router and worker agree on any name', () => {
    for (const name of ['Journal of Testing 2026', '日本語ジャーナル', '!!!', '', 'ACS-Nano_v3']) {
      const expected = normalizeTemplateClassName(name)
      expect(generateLatexClass(SPEC, name)).toContain(`\\ProvidesClass{${expected}}`)
      expect(expected.length).toBeGreaterThan(0)
      expect(expected).toMatch(/^[a-z]+$/)
    }
  })
})

describe('sniffLatexSpec', () => {
  it('parses geometry in mixed units and detects the base class', () => {
    const tex = `\\documentclass[10pt]{revtex4-2}
\\usepackage[paperwidth=210mm, paperheight=297mm, top=2.5cm, bottom=1in, left=72pt, right=72pt]{geometry}`
    const spec = sniffLatexSpec(tex)
    expect(spec.pageWidth).toBeCloseTo(210 * 2.8346, 1)
    expect(spec.pageHeight).toBeCloseTo(297 * 2.8346, 1)
    expect(spec.marginTop).toBeCloseTo(2.5 * 28.346, 1)
    expect(spec.marginBottom).toBeCloseTo(72.27, 1)
    expect(spec.marginLeft).toBeCloseTo(72, 1)
    expect((spec as Record<string, unknown>).baseClass).toBe('revtex4-2')
  })

  it('returns empty spec when no geometry present', () => {
    expect(sniffLatexSpec('\\documentclass{article}').pageWidth).toBeUndefined()
  })
})

describe('templateProcessor (DB + live IDML service)', () => {
  let fx: Fixture
  beforeAll(async () => { fx = await createFixture('template') })
  afterAll(async () => { await fx.cleanup() })

  async function makeTemplate(sourceFormat: 'IDML' | 'INDD' | 'LATEX' | 'PDF', targetEngine: 'SCRIBUS' | 'LATEX', sourceMinioKey: string) {
    return prisma.layoutTemplate.create({
      data: {
        tenantId: fx.tenantId, publicationId: fx.publicationId,
        name: `Tpl ${sourceFormat}->${targetEngine} ${randomUUID().slice(0, 6)}`,
        sourceFormat, targetEngine, sourceMinioKey,
      },
    })
  }

  const run = (templateId: string, sourceMinioKey: string, sourceFormat: string, targetEngine: string) =>
    templateProcessor({
      data: { type: 'TEMPLATE_PORT', templateId, sourceMinioKey, sourceFormat, targetEngine },
    } as Job)

  it('INDD fails fast with IDML-export guidance', async () => {
    const tpl = await makeTemplate('INDD', 'SCRIBUS', 'test-fixtures/whatever.indd')
    await expect(run(tpl.id, tpl.sourceMinioKey, 'indd', 'SCRIBUS')).rejects.toThrow(/IDML/)
    const reloaded = await prisma.layoutTemplate.findUniqueOrThrow({ where: { id: tpl.id } })
    expect(reloaded.status).toBe('FAILED')
    expect(reloaded.errorMessage).toMatch(/Export.*IDML|IDML/i)
  })

  it('PDF fails fast asking for source files', async () => {
    const tpl = await makeTemplate('PDF', 'LATEX', 'test-fixtures/layout.pdf')
    await expect(run(tpl.id, tpl.sourceMinioKey, 'pdf', 'LATEX')).rejects.toThrow(/IDML or LaTeX/)
  })

  it('LaTeX source targeting SCRIBUS is rejected', async () => {
    const key = await uploadFixture(`test-fixtures/${randomUUID()}/pub.cls`, '\\ProvidesClass{pub}', 'application/x-tex')
    const tpl = await makeTemplate('LATEX', 'SCRIBUS', key)
    await expect(run(tpl.id, key, 'latex', 'SCRIBUS')).rejects.toThrow(/LATEX engine/)
  })

  it('LaTeX source is stored as-is with sniffed spec (READY)', async () => {
    const tex = '\\ProvidesClass{acmjournal}\n\\RequirePackage[paperwidth=8.5in, paperheight=11in, top=1in, bottom=1in, left=1in, right=1in]{geometry}'
    const key = await uploadFixture(`test-fixtures/${randomUUID()}/acm.cls`, tex, 'application/x-tex')
    const tpl = await makeTemplate('LATEX', 'LATEX', key)

    const result = await run(tpl.id, key, 'latex', 'LATEX')
    expect(result.generatedKey).toMatch(/\.cls$/)

    const reloaded = await prisma.layoutTemplate.findUniqueOrThrow({ where: { id: tpl.id } })
    expect(reloaded.status).toBe('READY')
    expect(reloaded.generatedMinioKey).toBe(result.generatedKey)
    expect((reloaded.spec as Record<string, number>).pageWidth).toBeCloseTo(8.5 * 72.27, 0)

    const stored = await downloadFromMinio(result.generatedKey)
    expect(stored.toString()).toContain('\\ProvidesClass{acmjournal}')
  })

  it('IDML → Scribus .sla end-to-end through the live extractor', async () => {
    // Build the same synthetic IDML the Python tests use.
    const { deflateRawSync } = await import('node:zlib')
    void deflateRawSync // (zip built via python for fidelity)
    const { execSync } = await import('node:child_process')
    const idmlB64 = execSync(
      'python -c "import base64,sys; sys.path.insert(0,r\'D:/F-Drive/Authoring/pubflow_fresh/services/idml\'); from test_server import build_idml; print(base64.b64encode(build_idml()).decode())"',
      { encoding: 'utf-8' },
    ).trim()
    const key = await uploadFixture(
      `test-fixtures/${randomUUID()}/journal.idml`,
      Buffer.from(idmlB64, 'base64'),
      'application/vnd.adobe.indesign-idml-package',
    )
    const tpl = await makeTemplate('IDML', 'SCRIBUS', key)

    const result = await run(tpl.id, key, 'idml', 'SCRIBUS')
    expect(result.generatedKey).toMatch(/\.sla$/)

    const reloaded = await prisma.layoutTemplate.findUniqueOrThrow({ where: { id: tpl.id } })
    expect(reloaded.status).toBe('READY')
    const spec = reloaded.spec as Record<string, unknown>
    expect(spec.columnCount).toBe(2)
    expect(spec.fonts).toEqual(['Minion Pro', 'Myriad Pro'])

    const sla = (await downloadFromMinio(result.generatedKey)).toString()
    expect(XMLValidator.validate(sla)).toBe(true)
    expect(sla).toContain('JournalBlue')
  })
})
