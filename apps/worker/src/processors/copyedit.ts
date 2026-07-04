// ── Copyedit style-manual bot ────────────────────────────
// Runs the pluggable style engine for one CopyEdit assignment:
//   1. Extract plain text from the manuscript (Pandoc service → markdown)
//   2. Deterministic mechanics pass — LanguageTool with the manual's language
//      variant and rule set (packages: see lib/style-manuals.ts)
//   3. LLM copyeditor pass — manual-specific guidance + in-house overlay rules,
//      returning structured suggested edits (never auto-applied; the human
//      copyeditor reviews them in the dashboard)
// The combined result is stored on CopyEdit.botReport for the UI.
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { CopyEditJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'
import { aiEnabled, aiJSON } from '../lib/ai.js'
import { getStyleManual } from '../lib/style-manuals.js'

const PANDOC_URL = process.env.PANDOC_SERVICE_URL ?? 'http://localhost:5005'
const LT_URL     = process.env.LANGUAGETOOL_URL   ?? 'http://localhost:8082'
// LanguageTool caps request size; chunk long manuscripts.
const LT_CHUNK   = 40_000
// Bound the LLM pass to keep token cost predictable.
const AI_MAX_CHARS = 60_000

interface LtMatch {
  message: string
  offset: number
  length: number
  replacements: Array<{ value: string }>
  rule: { id: string; description: string; issueType: string; category?: { id: string } }
  context: { text: string; offset: number; length: number }
}

interface AiEdit {
  location: string
  original: string
  suggestion: string
  rule: string
  severity: 'required' | 'recommended'
}

async function extractText(minioKey: string, inputFormat: string): Promise<string> {
  const input = await downloadFromMinio(minioKey)
  // Markdown/LaTeX sources are already text.
  if (inputFormat === 'markdown' || inputFormat === 'latex') return input.toString('utf-8')

  const res = await fetch(`${PANDOC_URL}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputFormat,
      outputFormat: 'markdown',
      content: input.toString('base64'),
    }),
  })
  if (!res.ok) throw new Error(`Pandoc text extraction failed: ${await res.text()}`)
  const json = await res.json() as { content: string }
  return Buffer.from(json.content, 'base64').toString('utf-8')
}

async function runLanguageTool(
  text: string,
  language: string,
  enabledRules: string[],
  disabledRules: string[],
): Promise<LtMatch[]> {
  const matches: LtMatch[] = []
  for (let start = 0; start < text.length; start += LT_CHUNK) {
    const chunk = text.slice(start, start + LT_CHUNK)
    const params = new URLSearchParams({ language, text: chunk })
    if (enabledRules.length)  params.set('enabledRules',  enabledRules.join(','))
    if (disabledRules.length) params.set('disabledRules', disabledRules.join(','))

    const res = await fetch(`${LT_URL}/v2/check`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params,
      signal:  AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`LanguageTool returned ${res.status}`)
    const data = await res.json() as { matches: LtMatch[] }
    // Re-base offsets to the full document.
    for (const m of data.matches) matches.push({ ...m, offset: m.offset + start })
  }
  return matches
}

async function runAiCopyedit(
  text: string,
  manualLabel: string,
  aiGuidance: string,
  houseRules: string[],
): Promise<AiEdit[]> {
  const clipped = text.length > AI_MAX_CHARS
  const body = clipped ? text.slice(0, AI_MAX_CHARS) : text

  const system =
    `You are a professional scholarly copyeditor applying ${manualLabel}. ` +
    aiGuidance +
    (houseRules.length
      ? ` Additionally, enforce these in-house rules, which OVERRIDE the manual ` +
        `when they conflict: ${houseRules.map((r, i) => `(${i + 1}) ${r}`).join(' ')}`
      : '') +
    ' Only flag genuine style/mechanics issues the manual mandates — do not rewrite ' +
    'for taste, and never alter technical meaning, data, quotations, or citations content.'

  const prompt =
    `Copyedit the manuscript text below. Return a JSON array (max 60 items) of edits, ` +
    `each: {"location": "<±6 words of surrounding context>", "original": "<exact text ` +
    `to change>", "suggestion": "<replacement>", "rule": "<which ${manualLabel} rule>", ` +
    `"severity": "required"|"recommended"}. An empty array is a valid answer.` +
    `\n\n--- MANUSCRIPT ---\n${body}`

  const edits = await aiJSON<AiEdit[]>(prompt, { system, maxTokens: 8192 })
  return Array.isArray(edits) ? edits.filter((e) => e && e.original && e.suggestion) : []
}

export async function copyeditProcessor(job: Job) {
  const d = CopyEditJobSchema.parse(job.data)

  // Resolve the effective profile: explicit StyleProfile row wins over the
  // manual named inline on the job.
  let manual = d.styleManual
  let cslStyle = d.cslStyle
  let houseRules = d.houseRules
  if (d.styleProfileId) {
    const profile = await prisma.styleProfile.findUnique({ where: { id: d.styleProfileId } })
    if (profile) {
      manual = profile.manual as typeof manual
      cslStyle = profile.cslStyle
      houseRules = [...profile.houseRules, ...d.houseRules]
    }
  }
  const cfg = getStyleManual(manual)

  const report: Record<string, unknown> = {
    manual,
    manualLabel: cfg.label,
    cslStyle,
    startedAt: new Date().toISOString(),
  }

  try {
    const text = await extractText(d.inputMinioKey, d.inputFormat)
    report.charCount = text.length

    // 1) Deterministic mechanics pass (LanguageTool).
    let ltMatches: LtMatch[] = []
    try {
      ltMatches = await runLanguageTool(
        text,
        cfg.lt.language,
        cfg.lt.enabledRules ?? [],
        cfg.lt.disabledRules ?? [],
      )
      report.languageTool = {
        language: cfg.lt.language,
        matchCount: ltMatches.length,
        matches: ltMatches.slice(0, 500).map((m) => ({
          message: m.message,
          offset: m.offset,
          length: m.length,
          replacements: m.replacements.slice(0, 3).map((r) => r.value),
          ruleId: m.rule.id,
          issueType: m.rule.issueType,
          context: m.context.text,
        })),
      }
    } catch (err) {
      report.languageTool = { error: String(err) }
    }

    // 2) LLM copyeditor pass (skipped cleanly when no API key configured).
    if (d.applyAi && aiEnabled()) {
      try {
        const aiEdits = await runAiCopyedit(text, cfg.label, cfg.aiGuidance, houseRules)
        report.ai = { editCount: aiEdits.length, edits: aiEdits }
      } catch (err) {
        report.ai = { error: String(err) }
      }
    } else {
      report.ai = { skipped: true, reason: d.applyAi ? 'AI not configured' : 'disabled on job' }
    }

    report.finishedAt = new Date().toISOString()

    // Persist the full report alongside the copyedit assignment, and archive a
    // copy in MinIO for audit.
    const reportKey = `copyedit-reports/${d.submissionId}/${d.copyEditId}.json`
    await uploadToMinio(reportKey, Buffer.from(JSON.stringify(report, null, 2)), 'application/json')

    await prisma.copyEdit.update({
      where: { id: d.copyEditId },
      data: {
        styleManual: manual,
        botReport: { ...report, reportKey } as Prisma.InputJsonValue,
      },
    })

    await prisma.workflowLog.create({
      data: {
        submissionId: d.submissionId,
        toStatus:     'COPY_EDITING',
        performedBy:  'SYSTEM',
        note:         `Style bot (${cfg.label}) analyzed manuscript`,
        metadata: {
          copyEditId: d.copyEditId,
          manual,
          ltMatches: ltMatches.length,
          aiEdits: (report.ai as { editCount?: number })?.editCount ?? 0,
        } as Prisma.InputJsonValue,
      },
    })

    return { manual, ltMatches: ltMatches.length, reportKey }
  } catch (err) {
    await prisma.copyEdit.update({
      where: { id: d.copyEditId },
      data:  { botReport: { error: String(err), manual } as Prisma.InputJsonValue },
    })
    throw err
  }
}
