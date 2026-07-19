// ── Phase C editorial-intelligence endpoints ─────────────
// Reviewer matcher (deterministic COI filter + optional AI ranking) and
// decision-letter drafts (AI with a deterministic template fallback).
// Both are advisory: editors pick reviewers and send letters themselves.
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, editorProcedure } from '../trpc/procedures.js'
import { aiEnabled, aiText } from '../lib/ai.js'

interface Candidate {
  id: string
  name: string
  email: string
  affiliation: string | null
  reviewsDone: number
  activeLoad: number
  keywordHits: number
  coi: null
}

export const editorialRouter = router({
  // Rank potential peer reviewers for a submission. Hard COI exclusions are
  // deterministic and always applied; AI (when configured) re-ranks the
  // surviving candidates by topical fit and adds a one-line rationale.
  suggestReviewers: editorProcedure
    .input(z.object({ submissionId: z.string().uuid(), limit: z.number().min(1).max(20).default(8) }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
        include: { author: { select: { id: true, email: true, affiliation: true } } },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      const coEmails = new Set(
        (Array.isArray(sub.coAuthors) ? sub.coAuthors as Array<{ email?: string }> : [])
          .map((c) => c.email?.toLowerCase())
          .filter((e): e is string => !!e),
      )
      const authorAffiliation = sub.author.affiliation?.trim().toLowerCase() || null

      const reviewers = await prisma.user.findMany({
        where: { tenantId: user.tenantId, role: 'PEER_REVIEWER', status: 'ACTIVE' },
        select: {
          id: true, email: true, firstName: true, lastName: true, affiliation: true,
          assignedReviews: {
            select: {
              status: true,
              submission: { select: { id: true, keywords: true } },
            },
          },
        },
      })

      const kw = new Set(sub.keywords.map((k) => k.toLowerCase()))
      const candidates: Candidate[] = []
      const excluded: Array<{ email: string; reason: string }> = []

      for (const r of reviewers) {
        // Hard conflict-of-interest exclusions — never AI-overridable.
        if (r.id === sub.author.id || r.email.toLowerCase() === sub.author.email.toLowerCase()) {
          excluded.push({ email: r.email, reason: 'is the submitting author' }); continue
        }
        if (coEmails.has(r.email.toLowerCase())) {
          excluded.push({ email: r.email, reason: 'is a co-author' }); continue
        }
        if (authorAffiliation && r.affiliation?.trim().toLowerCase() === authorAffiliation) {
          excluded.push({ email: r.email, reason: `same affiliation as author (${r.affiliation})` }); continue
        }
        if (r.assignedReviews.some((rev) => rev.submission.id === sub.id)) {
          excluded.push({ email: r.email, reason: 'already assigned to this submission' }); continue
        }

        // Deterministic topical score: keyword overlap with previously
        // reviewed submissions; workload = open assignments.
        const keywordHits = r.assignedReviews.reduce(
          (n, rev) => n + rev.submission.keywords.filter((k) => kw.has(k.toLowerCase())).length, 0)
        const activeLoad = r.assignedReviews
          .filter((rev) => ['INVITED', 'ACCEPTED', 'IN_PROGRESS', 'OVERDUE'].includes(rev.status)).length
        const reviewsDone = r.assignedReviews.filter((rev) => rev.status === 'SUBMITTED').length

        candidates.push({
          id: r.id,
          name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email,
          email: r.email,
          affiliation: r.affiliation,
          reviewsDone, activeLoad, keywordHits,
          coi: null,
        })
      }

      // Deterministic order: topical fit desc, then lighter load, then experience.
      candidates.sort((a, b) =>
        b.keywordHits - a.keywordHits || a.activeLoad - b.activeLoad || b.reviewsDone - a.reviewsDone)
      let ranked = candidates.slice(0, input.limit)
      let aiRationale: Record<string, string> | null = null

      if (aiEnabled() && ranked.length > 1) {
        try {
          const raw = await aiText(
            `Submission: "${sub.title}"\nKeywords: ${sub.keywords.join(', ')}\n` +
            `Abstract: ${sub.abstract ?? '(none)'}\n\nCandidates:\n` +
            ranked.map((c, i) =>
              `${i}: ${c.name} (${c.affiliation ?? 'no affiliation'}; ` +
              `${c.reviewsDone} reviews done; keyword overlap ${c.keywordHits})`).join('\n') +
            `\n\nRe-rank by topical fit for THIS submission. Respond with ONLY JSON: ` +
            `{"order":[indices],"rationale":{"<index>":"one short line"}}`,
            { system: 'You rank peer reviewers by topical fit. Advisory only; be terse.' },
          )
          const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim()) as
            { order: number[]; rationale?: Record<string, string> }
          if (Array.isArray(parsed.order)) {
            const valid = parsed.order.filter((i) => Number.isInteger(i) && i >= 0 && i < ranked.length)
            const seen = new Set(valid)
            const reordered = [
              ...valid.map((i) => ranked[i]),
              ...ranked.filter((_, i) => !seen.has(i)),
            ]
            aiRationale = Object.fromEntries(
              Object.entries(parsed.rationale ?? {})
                .filter(([i]) => Number(i) >= 0 && Number(i) < ranked.length)
                .map(([i, why]) => [ranked[Number(i)].id, String(why)]),
            )
            ranked = reordered
          }
        } catch { /* AI ranking is optional — deterministic order stands */ }
      }

      return { candidates: ranked, excluded, aiRanked: aiRationale !== null, aiRationale }
    }),

  // Draft (never send) a decision letter synthesizing the round's reviews.
  draftDecisionLetter: editorProcedure
    .input(z.object({
      submissionId: z.string().uuid(),
      decision: z.enum(['ACCEPT', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECT', 'DESK_REJECT']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
        include: {
          author: { select: { firstName: true, lastName: true } },
          publication: { select: { title: true } },
          reviews: {
            where: { status: 'SUBMITTED', comments: { not: null } },
            orderBy: { submittedAt: 'asc' },
            select: { comments: true, recommendation: true, round: true },
          },
        },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      const authorName = [sub.author.firstName, sub.author.lastName].filter(Boolean).join(' ') || 'Author'
      const DECISION_TEXT: Record<typeof input.decision, string> = {
        ACCEPT: 'we are pleased to accept your manuscript for publication',
        MINOR_REVISION: 'we invite you to submit a minor revision',
        MAJOR_REVISION: 'we invite you to submit a major revision addressing the points below',
        REJECT: 'we are unable to accept your manuscript for publication',
        DESK_REJECT: 'your manuscript was not sent for external review',
      }

      if (aiEnabled() && sub.reviews.length > 0) {
        try {
          const letter = await aiText(
            `Journal: ${sub.publication.title}\nManuscript: "${sub.title}"\n` +
            `Author: ${authorName}\nDecision: ${input.decision}\n\nReviews:\n` +
            sub.reviews.map((r, i) =>
              `--- Reviewer ${i + 1} (recommends ${r.recommendation ?? 'n/a'}) ---\n${r.comments}`).join('\n\n') +
            `\n\nDraft a professional decision letter: greeting, the decision stated ` +
            `plainly in the first paragraph, a numbered synthesis of the substantive ` +
            `reviewer points (merged across reviewers, no verbatim dumps), next steps, ` +
            `courteous close signed "The Editorial Team". Do not invent findings.`,
            { system: 'You draft editorial decision letters for a human editor to revise. Return only the letter text.', maxTokens: 3000 },
          )
          return { letter, source: 'ai' as const, reviewCount: sub.reviews.length }
        } catch { /* fall through to template */ }
      }

      // Deterministic fallback: correct, sendable, unembellished.
      const letter = [
        `Dear ${authorName},`,
        '',
        `Thank you for submitting "${sub.title}" to ${sub.publication.title}. ` +
        `After ${sub.reviews.length ? `review by ${sub.reviews.length} referee(s)` : 'editorial assessment'}, ` +
        `${DECISION_TEXT[input.decision]}.`,
        '',
        ...(sub.reviews.length
          ? ['The reviewers’ comments are attached below for your reference.', '',
             ...sub.reviews.map((r, i) => `--- Reviewer ${i + 1} ---\n${r.comments}`), '']
          : []),
        'Sincerely,',
        'The Editorial Team',
      ].join('\n')
      return { letter, source: 'template' as const, reviewCount: sub.reviews.length }
    }),
})
