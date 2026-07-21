// ── Compliance bots ───────────────────────────────────────
// One processor, three job kinds routed on data.type:
//   ETHICS            — completeness + AI plausibility check on the ethics,
//                        trial-registration, funding, and COI statements.
//                        Advisory only; editors decide.
//   DATA_AVAILABILITY — extracts every URL/DOI from the author's data/code
//                        availability statement and confirms each one
//                        resolves (SSRF-safe: rejects private/internal
//                        targets, re-validated on every redirect).
//   LICENSE           — hard completeness gate: a license type must be
//                        selected and the copyright/author agreement signed.
// All reports use the preflightReport shape ({ status, ..., ranAt }).
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { ComplianceJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { aiEnabled, aiJSON } from '../lib/ai.js'
import { safeFetchCheck } from '../lib/safe-fetch.js'

type Report = Record<string, unknown>

// ── ETHICS ───────────────────────────────────────────────

interface EthicsAiResult {
  plausible: boolean
  concerns: string[]
  notes: string
}

async function runEthics(submissionId: string): Promise<Report> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: {
      abstract: true,
      ethicsStatement: true,
      trialRegistrationNumber: true,
      fundingStatement: true,
      coiStatement: true,
    },
  })

  const missing: string[] = []
  if (!sub.ethicsStatement?.trim()) missing.push('ethicsStatement')
  if (!sub.fundingStatement?.trim()) missing.push('fundingStatement')
  if (!sub.coiStatement?.trim()) missing.push('coiStatement')

  const base: Report = {
    missing,
    hasTrialRegistration: Boolean(sub.trialRegistrationNumber?.trim()),
  }

  if (!aiEnabled()) {
    return {
      status: missing.length ? 'warn' : 'pass',
      ...base,
      reason: 'AI not configured — completeness check only, no plausibility review',
    }
  }

  try {
    const prompt =
      `Abstract: ${sub.abstract ?? '(none)'}\n\n` +
      `Ethics statement: ${sub.ethicsStatement ?? '(none provided)'}\n` +
      `Trial registration: ${sub.trialRegistrationNumber ?? '(none provided)'}\n` +
      `Funding statement: ${sub.fundingStatement ?? '(none provided)'}\n` +
      `Conflict-of-interest statement: ${sub.coiStatement ?? '(none provided)'}\n\n` +
      `Judge plausibility only — does the ethics statement match what the abstract ` +
      `describes (e.g. human/animal subjects claimed in the abstract but no IRB/IACUC ` +
      `approval stated)? Do NOT judge scientific merit. JSON: {"plausible": boolean, ` +
      `"concerns": string[], "notes": string}`
    const r = await aiJSON<EthicsAiResult>(prompt, {
      system: 'You are a research-integrity assistant flagging ethics-disclosure gaps for a human editor. Advisory only — never decide.',
      maxTokens: 800,
    })
    const status = missing.length || !r.plausible ? (missing.length ? 'fail' : 'warn') : 'pass'
    return { status, ...base, ...r }
  } catch (err) {
    return { status: 'error', ...base, error: String(err) }
  }
}

// ── DATA_AVAILABILITY ────────────────────────────────────

// Matches bare URLs and bare DOIs (10.xxxx/yyyy) in free text.
const URL_RE = /https?:\/\/[^\s)>\]"']+/gi
const DOI_RE = /\b10\.\d{4,9}\/[^\s)>\]"',;]+/gi

export function extractLinks(text: string): string[] {
  const urls = text.match(URL_RE) ?? []
  const doiMatches = text.match(DOI_RE) ?? []
  // Bare DOIs (not already inside a matched URL) resolve via doi.org.
  const bareDois = doiMatches
    .filter((doi) => !urls.some((u) => u.includes(doi)))
    .map((doi) => `https://doi.org/${doi}`)
  return Array.from(new Set([...urls.map((u) => u.replace(/[.,;]+$/, '')), ...bareDois]))
}

async function runDataAvailability(submissionId: string): Promise<Report> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: { dataAvailabilityStatement: true },
  })
  const statement = sub.dataAvailabilityStatement?.trim()
  if (!statement) {
    return { status: 'warn', reason: 'No data/code availability statement provided', links: [] }
  }

  const links = extractLinks(statement)
  if (links.length === 0) {
    return { status: 'warn', reason: 'Statement provided but contains no checkable links', links: [] }
  }

  const results: Array<{ url: string; ok: boolean; status?: number; error?: string }> = []
  for (const url of links) {
    try {
      const r = await safeFetchCheck(url)
      results.push({ url, ok: r.ok, status: r.status })
    } catch (err) {
      results.push({ url, ok: false, error: String(err) })
    }
  }

  const broken = results.filter((r) => !r.ok)
  return {
    status: broken.length ? (broken.length === results.length ? 'fail' : 'warn') : 'pass',
    links: results,
    brokenCount: broken.length,
  }
}

// ── LICENSE ──────────────────────────────────────────────

async function runLicense(submissionId: string): Promise<Report> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: { licenseType: true, copyrightAgreedAt: true },
  })
  const missing: string[] = []
  if (!sub.licenseType) missing.push('licenseType')
  if (!sub.copyrightAgreedAt) missing.push('copyrightAgreedAt')
  return {
    status: missing.length ? 'fail' : 'pass',
    missing,
    licenseType: sub.licenseType,
  }
}

// ── Router ───────────────────────────────────────────────

async function save(
  submissionId: string,
  field: 'complianceReport' | 'dataAvailabilityReport' | 'licenseReport',
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
      submissionId, toStatus: sub.status, performedBy: 'SYSTEM', note,
      metadata: stamped as Prisma.InputJsonValue,
    },
  })
  return stamped
}

export async function complianceProcessor(job: Job) {
  const d = ComplianceJobSchema.parse(job.data)
  switch (d.type) {
    case 'ETHICS':
      return save(d.submissionId, 'complianceReport', await runEthics(d.submissionId), 'Ethics & compliance check')
    case 'DATA_AVAILABILITY':
      return save(d.submissionId, 'dataAvailabilityReport', await runDataAvailability(d.submissionId), 'Data/code availability check')
    case 'LICENSE':
      return save(d.submissionId, 'licenseReport', await runLicense(d.submissionId), 'License & copyright check')
  }
}
