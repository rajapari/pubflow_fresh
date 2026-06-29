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
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where:   { id: input.submissionId, tenantId: user.tenantId },
        include: { manuscripts: { where: { isLatest: true } } },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!TYPESETTING_STATUSES.includes(sub.status as typeof TYPESETTING_STATUSES[number]))
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Submission must be in a production stage (currently ${sub.status})` })
      if (!sub.manuscripts[0])
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No manuscript uploaded yet' })

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

      if (input.engine === 'PANDOC') {
        jobData['inputFormat']  = sub.manuscripts[0].format.toLowerCase()
        jobData['outputFormat'] = input.outputFormat.toLowerCase().replace('_print', '').replace('_web', '')
        jobData['options']      = { citationStyle: 'apa' }
      } else if (input.engine === 'LATEX') {
        jobData['documentClass'] = 'article'
        jobData['engine']        = 'xelatex'
        jobData['passes']        = 2
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
