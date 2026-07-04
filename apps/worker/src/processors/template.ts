// ── Template porting bot ─────────────────────────────────
// Recreates a publisher-provided layout (InDesign IDML or LaTeX template) as
// a reusable Scribus (.sla) or LaTeX (.cls) template on the platform.
//   IDML  → services/idml extracts a neutral layout spec → generator emits
//           the Scribus/LaTeX scaffold (~80% fidelity; designer finalizes).
//   LaTeX → the publisher class/preamble is normalized and stored directly.
//   INDD/PDF → cannot be parsed; fails with instructions to export IDML.
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { TemplatePortJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'
import { generateScribusSla, generateLatexClass, type LayoutSpec } from '../lib/template-gen.js'

const IDML_URL = process.env.IDML_SERVICE_URL ?? 'http://localhost:4100'

async function extractIdmlSpec(source: Buffer): Promise<LayoutSpec> {
  const res = await fetch(`${IDML_URL}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: source.toString('base64') }),
  })
  const json = await res.json() as { spec?: LayoutSpec; error?: string }
  if (!res.ok || !json.spec) {
    throw new Error(`IDML extraction failed: ${json.error ?? `HTTP ${res.status}`}`)
  }
  return json.spec
}

// Pull basic geometry out of a publisher LaTeX template so the spec is still
// recorded even when we keep their source as-is.
function sniffLatexSpec(tex: string): Partial<LayoutSpec> {
  const spec: Partial<LayoutSpec> = {}
  const geo = tex.match(/\\(?:usepackage|RequirePackage)\s*\[([^\]]*)\]\s*\{geometry\}/s)
  if (geo) {
    const opts = geo[1]
    const grab = (key: string) => {
      const m = opts.match(new RegExp(`${key}\\s*=\\s*([\\d.]+)\\s*(pt|mm|cm|in)`))
      if (!m) return undefined
      const v = parseFloat(m[1])
      const unit = m[2]
      const toPt = unit === 'mm' ? 2.8346 : unit === 'cm' ? 28.346 : unit === 'in' ? 72.27 : 1
      return v * toPt
    }
    spec.pageWidth  = grab('paperwidth')
    spec.pageHeight = grab('paperheight')
    spec.marginTop    = grab('top')
    spec.marginBottom = grab('bottom')
    spec.marginLeft   = grab('left')
    spec.marginRight  = grab('right')
  }
  const cls = tex.match(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)
  if (cls) (spec as Record<string, unknown>).baseClass = cls[1]
  return spec
}

export async function templateProcessor(job: Job) {
  const d = TemplatePortJobSchema.parse(job.data)

  await prisma.layoutTemplate.update({
    where: { id: d.templateId },
    data:  { status: 'PROCESSING', errorMessage: null },
  })

  try {
    const template = await prisma.layoutTemplate.findUniqueOrThrow({
      where: { id: d.templateId },
    })

    if (d.sourceFormat === 'indd' || d.sourceFormat === 'pdf') {
      throw new Error(
        d.sourceFormat === 'indd'
          ? 'Native .indd files cannot be parsed. In InDesign use File → Export → IDML and upload that instead.'
          : 'PDF layouts carry no editable geometry/styles. Ask the publisher for the IDML or LaTeX source.',
      )
    }

    const source = await downloadFromMinio(d.sourceMinioKey)
    let generated: string
    let ext: string
    let spec: Record<string, unknown>

    if (d.sourceFormat === 'idml') {
      const layoutSpec = await extractIdmlSpec(source)
      spec = layoutSpec as unknown as Record<string, unknown>
      if (d.targetEngine === 'SCRIBUS') {
        generated = generateScribusSla(layoutSpec, template.name)
        ext = 'sla'
      } else {
        generated = generateLatexClass(layoutSpec, template.name)
        ext = 'cls'
      }
    } else {
      // LaTeX source: keep the publisher's class/template, record sniffed geometry.
      const tex = source.toString('utf-8')
      spec = sniffLatexSpec(tex) as Record<string, unknown>
      if (d.targetEngine !== 'LATEX') {
        throw new Error('LaTeX sources can only target the LATEX engine (Scribus cannot consume .cls/.tex).')
      }
      generated = tex
      ext = /\\ProvidesClass/.test(tex) ? 'cls' : 'tex'
    }

    const generatedKey = `templates/${template.tenantId}/${d.templateId}/template.${ext}`
    await uploadToMinio(
      generatedKey,
      Buffer.from(generated, 'utf-8'),
      ext === 'sla' ? 'application/xml' : 'application/x-tex',
    )

    await prisma.layoutTemplate.update({
      where: { id: d.templateId },
      data: {
        status:            'READY',
        generatedMinioKey: generatedKey,
        spec:              { ...spec, portedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    })

    return { generatedKey, targetEngine: d.targetEngine }
  } catch (err) {
    await prisma.layoutTemplate.update({
      where: { id: d.templateId },
      data:  { status: 'FAILED', errorMessage: String(err) },
    })
    throw err
  }
}
