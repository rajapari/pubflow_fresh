import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, editorProcedure, chiefEditorProcedure } from '../trpc/procedures.js'
import { QUEUES } from '@pubflow/types'
import { depositToCrossRef, type CrossRefArticle } from '../lib/crossref.js'
import { depositToPubMed } from '../lib/pubmed.js'
import { submitToLulu } from '../lib/printod.js'

export const issueRouter = router({
  // ── Issue Assembler (Stage 12) ─────────────────────────

  // Set the reading order of articles inside an issue. Pass the full ordered
  // list of submission ids; each gets issueOrder = its position (1-based).
  setArticleOrder: editorProcedure
    .input(z.object({
      issueId: z.string().uuid(),
      submissionIds: z.array(z.string().uuid()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const issue = await prisma.issue.findFirst({
        where: { id: input.issueId, publication: { tenantId: user.tenantId } },
        include: { submissions: { select: { id: true } } },
      })
      if (!issue) throw new TRPCError({ code: 'NOT_FOUND' })

      const inIssue = new Set(issue.submissions.map((s) => s.id))
      const unknown = input.submissionIds.filter((id) => !inIssue.has(id))
      if (unknown.length)
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Submissions not in this issue: ${unknown.join(', ')}` })

      await prisma.$transaction(
        input.submissionIds.map((id, i) =>
          prisma.submission.update({ where: { id }, data: { issueOrder: i + 1 } }),
        ),
      )
      return { ordered: input.submissionIds.length }
    }),

  // Queue the Issue Assembler bot: ToC + article PDFs → one issue PDF.
  assemble: editorProcedure
    .input(z.object({
      issueId: z.string().uuid(),
      pdfFormat: z.enum(['PDF_WEB', 'PDF_PRINT']).default('PDF_WEB'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const issue = await prisma.issue.findFirst({
        where: { id: input.issueId, publication: { tenantId: user.tenantId } },
        include: { submissions: { select: { id: true } } },
      })
      if (!issue) throw new TRPCError({ code: 'NOT_FOUND' })
      if (issue.submissions.length === 0)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Issue has no assigned articles' })

      await queues[QUEUES.ISSUE].add('assemble-issue', {
        type: 'ISSUE_ASSEMBLY',
        issueId: input.issueId,
        pdfFormat: input.pdfFormat,
      })
      return { queued: true, articles: issue.submissions.length }
    }),

  // Presigned link to the compiled issue PDF (null-safe status included).
  getCompiledPdf: protectedProcedure
    .input(z.object({ issueId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const issue = await ctx.prisma.issue.findFirst({
        where: { id: input.issueId, publication: { tenantId: ctx.user.tenantId } },
        select: { compiledPdfKey: true, compiledAt: true, compileError: true },
      })
      if (!issue) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!issue.compiledPdfKey)
        return { url: null, compiledAt: null, compileError: issue.compileError }
      const url = await ctx.minio.client.presignedGetObject(ctx.minio.bucket, issue.compiledPdfKey, 900)
      return { url, compiledAt: issue.compiledAt, compileError: issue.compileError }
    }),


  list: protectedProcedure
    .input(z.object({ publicationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const pub = await ctx.prisma.publication.findFirst({
        where: { id: input.publicationId, tenantId: ctx.user.tenantId },
      })
      if (!pub) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.prisma.issue.findMany({
        where:   { publicationId: input.publicationId },
        include: {
          submissions: {
            select: { id: true, title: true, status: true, authorId: true,
                      author: { select: { firstName: true, lastName: true } } },
          },
          _count: { select: { submissions: true } },
        },
        orderBy: [{ year: 'desc' }, { volume: 'desc' }, { number: 'desc' }],
      })
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const issue = await ctx.prisma.issue.findUnique({
        where: { id: input.id },
        include: {
          publication: { select: { id: true, title: true, tenantId: true } },
          submissions: {
            include: {
              author:      { select: { id: true, firstName: true, lastName: true } },
              manuscripts: { where: { isLatest: true }, take: 1 },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!issue) throw new TRPCError({ code: 'NOT_FOUND' })
      if (issue.publication.tenantId !== ctx.user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      return issue
    }),

  create: editorProcedure
    .input(z.object({
      publicationId: z.string().uuid(),
      volume:        z.number().int().positive().optional(),
      number:        z.number().int().positive().optional(),
      year:          z.number().int().min(1900).max(2100),
      title:         z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pub = await ctx.prisma.publication.findFirst({
        where: { id: input.publicationId, tenantId: ctx.user.tenantId },
      })
      if (!pub) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.prisma.issue.create({ data: input })
    }),

  update: editorProcedure
    .input(z.object({
      id:     z.string().uuid(),
      volume: z.number().int().positive().optional(),
      number: z.number().int().positive().optional(),
      year:   z.number().int().min(1900).max(2100).optional(),
      title:  z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const issue = await ctx.prisma.issue.findUnique({
        where: { id: input.id },
        include: { publication: { select: { tenantId: true } } },
      })
      if (!issue) throw new TRPCError({ code: 'NOT_FOUND' })
      if (issue.publication.tenantId !== ctx.user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      if (issue.publishedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot edit a published issue' })

      const { id, ...data } = input
      return ctx.prisma.issue.update({ where: { id }, data })
    }),

  assignSubmission: editorProcedure
    .input(z.object({
      issueId:      z.string().uuid(),
      submissionId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const issue = await ctx.prisma.issue.findUnique({
        where:   { id: input.issueId },
        include: { publication: { select: { tenantId: true } } },
      })
      if (!issue) throw new TRPCError({ code: 'NOT_FOUND' })
      if (issue.publication.tenantId !== ctx.user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })

      const sub = await ctx.prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: ctx.user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found' })
      if (!['APPROVED', 'PROOF_REVIEW', 'PUBLISHED'].includes(sub.status))
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only APPROVED or later submissions can be assigned to an issue' })

      return ctx.prisma.submission.update({
        where: { id: input.submissionId },
        data:  { issueId: input.issueId },
      })
    }),

  removeSubmission: editorProcedure
    .input(z.object({
      issueId:      z.string().uuid(),
      submissionId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const issue = await ctx.prisma.issue.findUnique({
        where:   { id: input.issueId },
        include: { publication: { select: { tenantId: true } } },
      })
      if (!issue) throw new TRPCError({ code: 'NOT_FOUND' })
      if (issue.publication.tenantId !== ctx.user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      if (issue.publishedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot modify a published issue' })

      return ctx.prisma.submission.update({
        where: { id: input.submissionId },
        data:  { issueId: null },
      })
    }),

  publish: chiefEditorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx

      const issue = await prisma.issue.findUnique({
        where:   { id: input.id },
        include: {
          publication: { select: { tenantId: true, title: true, issn: true } },
          submissions: { include: { author: { select: { id: true, email: true, firstName: true, lastName: true, orcid: true } } } },
        },
      })
      if (!issue) throw new TRPCError({ code: 'NOT_FOUND' })
      if (issue.publication.tenantId !== user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      if (issue.publishedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Issue already published' })
      if (!issue.submissions.length)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Issue has no submissions' })

      const publishable = issue.submissions.filter(s => s.status === 'APPROVED')
      if (!publishable.length)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No APPROVED submissions to publish' })

      const now = new Date()

      // Resolve DOI prefix and CrossRef credentials if DOI registration is enabled
      const settings = await prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId } })
      const doiEnabled = !!(settings?.enableDoiRegistration && settings?.doiPrefix)
      const year = now.getFullYear()

      // Build DOI strings before the transaction so we can include them
      const doiMap = new Map<string, string>()
      if (doiEnabled) {
        for (const sub of publishable) {
          doiMap.set(sub.id, `${settings!.doiPrefix}/${year}.${sub.id.slice(0, 8)}`)
        }
      }

      // Mark issue as published + all APPROVED submissions → PUBLISHED
      await prisma.$transaction([
        prisma.issue.update({
          where: { id: input.id },
          data:  { publishedAt: now },
        }),
        ...publishable.map(sub =>
          prisma.submission.update({
            where: { id: sub.id },
            data: {
              status: 'PUBLISHED',
              doi:    doiMap.get(sub.id),
              workflowLogs: { create: {
                fromStatus:  'APPROVED',
                toStatus:    'PUBLISHED',
                performedBy: user.id,
                note: `Published in issue: ${issue.title ?? `Vol. ${issue.volume} No. ${issue.number}`}`,
              }},
            },
          })
        ),
      ])

      // Queue PUBLISHED notifications for each author
      await Promise.all(
        publishable.map(sub =>
          queues[QUEUES.NOTIFICATION].add(`published-${sub.id}`, {
            type: 'NOTIFICATION',
            to:   [sub.author.email],
            template: 'PUBLISHED',
            data: { submissionId: sub.id, title: sub.title },
          })
        )
      )

      // Attempt CrossRef metadata deposit (non-blocking — don't fail publish if this errors)
      if (doiEnabled) {
        const loginId  = settings!.crossrefLoginId    ?? process.env.CROSSREF_LOGIN_ID
        const loginPwd = settings!.crossrefLoginPassword ?? process.env.CROSSREF_LOGIN_PASSWORD

        if (loginId && loginPwd) {
          const appUrl  = process.env.APP_URL ?? 'https://app.pubflow.io'
          const testMode = process.env.CROSSREF_TEST_MODE !== 'false'

          const articles: CrossRefArticle[] = publishable
            .filter(sub => doiMap.has(sub.id))
            .map(sub => ({
              doi:         doiMap.get(sub.id)!,
              title:       sub.title,
              firstName:   sub.author.firstName ?? '',
              lastName:    sub.author.lastName  ?? '',
              orcid:       (sub.author as any).orcid ?? null,
              coAuthors:   (Array.isArray((sub as any).coAuthors) ? (sub as any).coAuthors : []) as Array<{ name: string; orcid?: string }>,
              resourceUrl: `${appUrl}/articles/${sub.id}`,
              pubDate:     now,
            }))

          depositToCrossRef(
            {
              doiPrefix:    settings!.doiPrefix!,
              journalTitle: issue.publication.title,
              issn:         (issue.publication as any).issn ?? null,
              volume:       issue.volume,
              number:       issue.number,
              year:         issue.year,
              articles,
            },
            {
              loginId,
              loginPassword: loginPwd,
              depositorName:  issue.publication.title,
              depositorEmail: process.env.CROSSREF_DEPOSITOR_EMAIL ?? process.env.SMTP_FROM ?? 'noreply@pubflow.local',
              testMode,
            },
          )
            .then(r => {
              if (r.queued) {
                console.info(`[CrossRef] Deposit queued — batch ${r.batchId}`)
              } else {
                console.warn(`[CrossRef] Deposit may have failed. Response: ${r.rawResponse.slice(0, 300)}`)
              }
            })
            .catch(err => console.error('[CrossRef] Deposit error:', err.message))
        } else {
          console.warn('[CrossRef] DOI registration enabled but no credentials found. Set crossrefLoginId/Password in settings or CROSSREF_LOGIN_ID/CROSSREF_LOGIN_PASSWORD env vars.')
        }
      }

      // ── HTML static pages → MinIO public/ folder (non-blocking) ────────────
      const tenantData = await prisma.tenant.findUnique({
        where:  { id: user.tenantId },
        select: { slug: true },
      })
      if (tenantData?.slug) {
        const slug = tenantData.slug
        for (const sub of publishable) {
          prisma.output.findFirst({
            where: { submissionId: sub.id, format: 'HTML', status: 'COMPLETED' },
          }).then(htmlOut => {
            if (!htmlOut) return
            return ctx.minio.download(htmlOut.minioKey).then(buf =>
              ctx.minio.putObject(
                `public/${slug}/articles/${sub.id}/index.html`,
                buf,
                'text/html; charset=utf-8',
              )
            )
          }).catch(err => console.error(`[HTML-MinIO] ${sub.id}:`, err.message))
        }
      }

      // ── PubMed Central FTP deposit of JATS XML (non-blocking) ───────────
      const pmcHost = (settings as any)?.pmcFtpHost    ?? process.env.PMC_FTP_HOST
      const pmcUser = (settings as any)?.pmcFtpUsername ?? process.env.PMC_FTP_USERNAME
      const pmcPass = (settings as any)?.pmcFtpPassword ?? process.env.PMC_FTP_PASSWORD
      if (pmcHost && pmcUser && pmcPass) {
        for (const sub of publishable) {
          prisma.output.findFirst({
            where: { submissionId: sub.id, format: 'JATS_XML', status: 'COMPLETED' },
          }).then(jatsOut => {
            if (!jatsOut) return
            return ctx.minio.download(jatsOut.minioKey).then(buf =>
              depositToPubMed(
                buf.toString('utf8'),
                `pubflow_${sub.id}_${now.getFullYear()}.xml`,
                {
                  ftpHost:     pmcHost,
                  ftpUsername: pmcUser,
                  ftpPassword: pmcPass,
                  ftpPath:     (settings as any)?.pmcFtpPath ?? process.env.PMC_FTP_PATH,
                },
              )
            ).then(() => console.info(`[PubMed] Deposited ${sub.id}`))
          }).catch(err => console.error(`[PubMed] ${sub.id}:`, err.message))
        }
      }

      // ── Lulu print-on-demand (non-blocking) ─────────────────────────────
      const luluKey     = (settings as any)?.luluClientKey    ?? process.env.LULU_CLIENT_KEY
      const luluSecret  = (settings as any)?.luluClientSecret  ?? process.env.LULU_CLIENT_SECRET
      const luluPodPkg  = (settings as any)?.luluPodPackageId  ?? process.env.LULU_POD_PACKAGE_ID
      if ((settings as any)?.enablePrintOnDemand && luluKey && luluSecret && luluPodPkg) {
        for (const sub of publishable) {
          prisma.output.findFirst({
            where: { submissionId: sub.id, format: 'PDF_PRINT', status: 'COMPLETED' },
          }).then(async pdfOut => {
            if (!pdfOut) return
            const interiorUrl = await ctx.minio.client.presignedGetObject(
              ctx.minio.bucket, pdfOut.minioKey, 3600,
            )
            return submitToLulu({
              title:        sub.title,
              interiorUrl,
              contactEmail: process.env.SMTP_FROM ?? 'noreply@pubflow.local',
              externalId:   sub.id,
              creds:        { clientKey: luluKey, clientSecret: luluSecret, podPackageId: luluPodPkg },
            }).then(r => console.info(`[Lulu] Print job ${r.id} (${r.status}) for ${sub.id}`))
          }).catch(err => console.error(`[Lulu] ${sub.id}:`, err.message))
        }
      }

      return { published: publishable.length }
    }),

  // Candidate submissions (APPROVED or PROOF_REVIEW, unassigned or in this issue)
  candidates: editorProcedure
    .input(z.object({
      issueId:       z.string().uuid(),
      publicationId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.submission.findMany({
        where: {
          tenantId:      ctx.user.tenantId,
          publicationId: input.publicationId,
          status:        { in: ['APPROVED', 'PROOF_REVIEW'] },
          OR: [{ issueId: null }, { issueId: input.issueId }],
        },
        include: {
          author: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    }),
})
