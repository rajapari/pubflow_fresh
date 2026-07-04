import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, editorProcedure } from '../trpc/procedures.js'
import { QUEUES } from '@pubflow/types'

const TYPESETTING_STATUSES = ['ACCEPTED', 'COPY_EDITING', 'ARTWORK_PROCESSING', 'TYPESETTING', 'PROOF_REVIEW', 'APPROVED', 'PUBLISHED'] as const

export const typeSettingRouter = router({
  listSubmissions: editorProcedure
    .input(z.object({
      status: z.enum(TYPESETTING_STATUSES).optional(),
      page:   z.number().min(1).default(1),
      limit:  z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const where: Record<string, unknown> = {
        tenantId: user.tenantId,
        status: input.status ?? { in: [...TYPESETTING_STATUSES] },
      }

      const [submissions, total] = await Promise.all([
        prisma.submission.findMany({
          where,
          include: {
            author:      { select: { id: true, firstName: true, lastName: true } },
            publication: { select: { id: true, title: true } },
            outputs:     { orderBy: { createdAt: 'desc' }, take: 3 },
            manuscripts: { where: { isLatest: true } },
          },
          orderBy: { updatedAt: 'desc' },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        prisma.submission.count({ where }),
      ])

      return { submissions, total, page: input.page, limit: input.limit }
    }),

  listOutputs: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      return prisma.output.findMany({
        where:   { submissionId: input.submissionId },
        orderBy: { createdAt: 'desc' },
      })
    }),

  triggerJob: editorProcedure
    .input(z.object({
      submissionId: z.string().uuid(),
      engine:       z.enum(['LATEX', 'PANDOC', 'SCRIBUS']),
      outputFormat: z.enum(['PDF_PRINT', 'PDF_WEB', 'EPUB', 'HTML', 'JATS_XML']),
      // Ported publisher layout to typeset against (see layoutTemplate router).
      templateId:   z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where:   { id: input.submissionId, tenantId: user.tenantId },
        include: {
          manuscripts: { where: { isLatest: true } },
          publication: { select: { id: true } },
        },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!TYPESETTING_STATUSES.includes(sub.status as typeof TYPESETTING_STATUSES[number]))
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Submission must be in a production stage (currently ${sub.status})` })
      if (!sub.manuscripts[0])
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No manuscript uploaded yet' })

      // Resolve the layout template: explicit id, else publication default.
      let template = null
      if (input.templateId) {
        template = await prisma.layoutTemplate.findFirst({
          where: { id: input.templateId, tenantId: user.tenantId },
        })
        if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Layout template not found' })
        if (template.status !== 'READY' || !template.generatedMinioKey)
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Template is ${template.status}, not READY` })
      } else if (input.engine !== 'PANDOC') {
        template = await prisma.layoutTemplate.findFirst({
          where: {
            tenantId: user.tenantId,
            targetEngine: input.engine,
            status: 'READY',
            isDefault: true,
            OR: [{ publicationId: sub.publication.id }, { publicationId: null }],
          },
          orderBy: { publicationId: { sort: 'desc', nulls: 'last' } },
        })
      }
      if (template && template.targetEngine !== input.engine)
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Template targets ${template.targetEngine}, not ${input.engine}` })
      if (input.engine === 'SCRIBUS' && !template?.generatedMinioKey)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Scribus typesetting requires a READY layout template' })

      const output = await prisma.output.create({
        data: {
          submissionId: input.submissionId,
          format:       input.outputFormat,
          engine:       input.engine,
          minioKey:     '',
          status:       'QUEUED',
        },
      })

      const queueMap = { LATEX: QUEUES.LATEX, PANDOC: QUEUES.PANDOC, SCRIBUS: QUEUES.SCRIBUS } as const
      const jobData: Record<string, unknown> = {
        type:         input.engine,
        submissionId: input.submissionId,
        outputId:     output.id,
        inputMinioKey: sub.manuscripts[0].minioKey,
      }

      const PANDOC_FORMAT: Record<string, string> = {
        PDF_PRINT: 'pdf',
        PDF_WEB:   'pdf',
        EPUB:      'epub',
        HTML:      'html',
        JATS_XML:  'jats',
        DOCX:      'docx',
        BIBTEX:    'bibtex',
      }

      if (input.engine === 'PANDOC') {
        const pandocFmt = PANDOC_FORMAT[input.outputFormat]
        if (!pandocFmt) throw new TRPCError({ code: 'BAD_REQUEST', message: `${input.outputFormat} is not supported by Pandoc` })
        jobData['inputFormat']  = sub.manuscripts[0].format.toLowerCase()
        jobData['outputFormat'] = pandocFmt
        jobData['options']      = { citationStyle: 'apa' }
      } else if (input.engine === 'LATEX') {
        // Class name must match the filename the worker writes for the ported template.
        const className = template
          ? template.name.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'pubflowtemplate'
          : 'article'
        jobData['documentClass'] = className
        jobData['engine']        = 'xelatex'
        jobData['passes']        = 2
        if (template?.generatedMinioKey) {
          jobData['templateMinioKey']  = template.generatedMinioKey
          jobData['templateClassName'] = className
        }
      } else if (input.engine === 'SCRIBUS') {
        jobData['templateMinioKey'] = template!.generatedMinioKey
        jobData['contentMinioKey']  = sub.manuscripts[0].minioKey
        jobData['assetMinioKeys']   = []
        jobData['outputFormat']     = input.outputFormat === 'PDF_PRINT' ? 'PDF_X4' : 'PDF'
      }

      await queues[queueMap[input.engine]].add('typeset', jobData)

      return { outputId: output.id, status: 'QUEUED' }
    }),

  getOutputDownloadUrl: protectedProcedure
    .input(z.object({ outputId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma, minio } = ctx
      const output = await prisma.output.findFirst({
        where:   { id: input.outputId, submission: { tenantId: user.tenantId } },
        include: { submission: { select: { tenantId: true } } },
      })
      if (!output) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!output.minioKey) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Output not yet generated' })

      const url = await minio.client.presignedGetObject(minio.bucket, output.minioKey, 900)
      return { url, format: output.format, engine: output.engine }
    }),
})
