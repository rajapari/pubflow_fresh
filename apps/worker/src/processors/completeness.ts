// ── Format & Completeness Checker (Stage 1) ─────────────────────────────────
// Deterministic pre-desk-review checks over a fresh submission: metadata
// present, manuscript file exists and is readable, word count in a sane range,
// references section present, figure mentions consistent with uploaded figure
// assets. No AI. Result goes to a SYSTEM WorkflowLog entry (structured
// metadata) and, when anything FAILS, a notification to the author so they can
// fix the submission before an editor ever opens it.
import type { Job } from 'bullmq'
import { CompletenessJobSchema, QUEUES } from '@pubflow/types'
import { Queue } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio } from '../lib/storage.js'
import { readZip, extractParagraphs } from '../lib/docx.js'

type Level = 'pass' | 'warn' | 'fail'
interface Check { id: string; label: string; status: Level; detail: string }

const notificationQueue = new Queue(QUEUES.NOTIFICATION, {
  connection: (() => {
    try {
      const u = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/0')
      return {
        host: u.hostname || '127.0.0.1', port: Number(u.port) || 6379,
        password: u.password || undefined, db: Number(u.pathname?.replace('/', '') || 0),
      }
    } catch { return { host: '127.0.0.1', port: 6379 } }
  })(),
})

export async function completenessCheck(job: Job) {
  const d = CompletenessJobSchema.parse(job.data)

  const sub = await prisma.submission.findUnique({
    where: { id: d.submissionId },
    include: {
      author: { select: { email: true } },
      manuscripts: { where: { isLatest: true } },
      assets: { select: { assetType: true } },
    },
  })
  if (!sub) throw new Error(`Submission ${d.submissionId} not found`)

  const checks: Check[] = []
  const add = (id: string, label: string, status: Level, detail: string) =>
    checks.push({ id, label, status, detail })

  // ── Metadata ────────────────────────────────────────────
  add('title', 'Title', sub.title.trim().length >= 10 ? 'pass' : 'fail',
    `${sub.title.trim().length} characters`)

  if (!sub.abstract || sub.abstract.trim().length === 0)
    add('abstract', 'Abstract', 'fail', 'No abstract provided')
  else if (sub.abstract.trim().length < 100)
    add('abstract', 'Abstract', 'warn', `Only ${sub.abstract.trim().length} characters — most journals expect 150–300 words`)
  else
    add('abstract', 'Abstract', 'pass', `${sub.abstract.trim().split(/\s+/).length} words`)

  add('keywords', 'Keywords',
    sub.keywords.length >= 3 ? 'pass' : sub.keywords.length >= 1 ? 'warn' : 'fail',
    `${sub.keywords.length} provided (3–6 recommended)`)

  const coAuthors = Array.isArray(sub.coAuthors) ? sub.coAuthors as Array<Record<string, unknown>> : []
  const badEmails = coAuthors.filter(c => typeof c['email'] !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c['email'])))
  add('coauthors', 'Co-author details',
    badEmails.length === 0 ? 'pass' : 'warn',
    badEmails.length === 0
      ? `${coAuthors.length} co-author(s), all emails valid`
      : `${badEmails.length} co-author(s) with missing/invalid email`)

  // ── Manuscript file ─────────────────────────────────────
  const manuscript = sub.manuscripts[0]
  if (!manuscript) {
    add('manuscript', 'Manuscript file', 'fail', 'No manuscript uploaded')
  } else {
    add('manuscript', 'Manuscript file', 'pass',
      `${manuscript.format}, ${(manuscript.fileSizeBytes / 1024).toFixed(1)} KB, version ${manuscript.version}`)

    if (manuscript.format === 'DOCX') {
      try {
        const buf = await downloadFromMinio(manuscript.minioKey)
        readZip(buf) // integrity: throws on a corrupt package
        const paragraphs = extractParagraphs(buf)
        const text  = paragraphs.join('\n')
        const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length

        add('integrity', 'File integrity', 'pass', 'DOCX package parses cleanly')
        add('wordcount', 'Word count',
          words >= 1000 ? 'pass' : words >= 250 ? 'warn' : 'fail',
          `${words} words in body text`)

        const hasReferences = paragraphs.some(p => /^(references|bibliography|works cited|literature cited)\b/i.test(p.trim()))
        add('references', 'References section', hasReferences ? 'pass' : 'warn',
          hasReferences ? 'Found a references heading' : 'No references/bibliography heading found')

        // Figures mentioned in text vs figure files actually uploaded
        const mentioned = new Set<string>()
        for (const m of text.matchAll(/\b(?:figure|fig\.?)\s+(\d{1,2})/gi)) mentioned.add(m[1])
        const uploadedFigures = sub.assets.filter(a =>
          a.assetType === 'FIGURE' || a.assetType === 'GRAPHICAL_ABSTRACT').length
        if (mentioned.size > 0 && uploadedFigures === 0)
          add('figures', 'Figures', 'fail',
            `Text references ${mentioned.size} figure(s) but no figure files are uploaded`)
        else if (mentioned.size > uploadedFigures)
          add('figures', 'Figures', 'warn',
            `Text references ${mentioned.size} figure(s); only ${uploadedFigures} figure file(s) uploaded`)
        else
          add('figures', 'Figures', 'pass',
            `${mentioned.size} referenced in text, ${uploadedFigures} uploaded`)
      } catch (err) {
        add('integrity', 'File integrity', 'fail',
          `DOCX could not be read: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      add('integrity', 'File integrity', 'warn',
        `${manuscript.format} content checks not supported — reviewed manually`)
    }
  }

  const fails = checks.filter(c => c.status === 'fail')
  const warns = checks.filter(c => c.status === 'warn')
  const summary = fails.length > 0
    ? `INCOMPLETE — ${fails.length} check(s) failed, ${warns.length} warning(s)`
    : warns.length > 0
      ? `COMPLETE with ${warns.length} warning(s)`
      : 'COMPLETE — all checks passed'

  await prisma.workflowLog.create({
    data: {
      submissionId: d.submissionId,
      toStatus:     'SUBMITTED',
      fromStatus:   null,
      performedBy:  'SYSTEM',
      note:         `Completeness check: ${summary}`,
      metadata:     { checks, summary } as object,
    },
  })

  // Only interrupt the author when something actually failed
  if (fails.length > 0 && sub.author?.email) {
    await notificationQueue.add('completeness-report', {
      type: 'NOTIFICATION',
      to: [sub.author.email],
      template: 'COMPLETENESS_REPORT',
      data: {
        submissionId: d.submissionId,
        title: sub.title,
        fails: fails.map(f => `${f.label}: ${f.detail}`),
        warns: warns.map(w => `${w.label}: ${w.detail}`),
      },
    })
  }

  console.info(`✅ [completeness] ${d.submissionId}: ${summary}`)
  return { summary, fails: fails.length, warns: warns.length, checks: checks.length }
}
