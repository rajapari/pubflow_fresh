import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { AnyRouter } from '@trpc/server'
import { router, protectedProcedure, chiefEditorProcedure } from '../trpc/procedures.js'
import { CreateSubmissionSchema, EditorialDecisionSchema,
         SubmissionStatusSchema, SubmissionStatus, isValidTransition } from '@pubflow/types'
import { MinioStorage } from '../plugins/minio.js'
import { QUEUES } from '@pubflow/types'
import { createHmac } from 'crypto'

type ManuscriptFormat = 'DOCX' | 'LATEX' | 'MARKDOWN' | 'ODT' | 'RTF'

export const submissionRouter = router({

  list: protectedProcedure
    .input(z.object({
      status: SubmissionStatusSchema.optional(),
      publicationId: z.string().uuid().optional(),
      page:  z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const where: Record<string, unknown> = { tenantId: user.tenantId }
      if (input.status)        where['status']        = input.status
      if (input.publicationId) where['publicationId'] = input.publicationId
      if (user.role === 'AUTHOR') where['authorId']   = user.id

      const [submissions, total] = await Promise.all([
        prisma.submission.findMany({
          where,
          include: {
            author:      { select: { id:true, firstName:true, lastName:true, email:true } },
            publication: { select: { id:true, title:true } },
            _count:      { select: { reviews:true } },
          },
          orderBy: { createdAt: 'desc' },
          skip:  (input.page - 1) * input.limit,
          take:  input.limit,
        }),
        prisma.submission.count({ where }),
      ])
      return { submissions, total, page: input.page, limit: input.limit }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId },
        include: {
          author:      true,
          publication: true,
          manuscripts: { orderBy: { version: 'desc' } },
          reviews:     { include: { reviewer: { select: { id:true, firstName:true, lastName:true } } } },
          assets:      true,
          outputs:     { orderBy: { createdAt: 'desc' } },
          decisions:   { include: { editor: true }, orderBy: { createdAt: 'desc' } },
          workflowLogs:{ orderBy: { createdAt: 'desc' }, take: 20 },
        },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (user.role === 'AUTHOR' && sub.authorId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })
      return sub
    }),

  create: protectedProcedure
    .input(CreateSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const pub = await prisma.publication.findFirst({
        where: { id: input.publicationId, tenantId: user.tenantId },
      })
      if (!pub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Publication not found' })

      return prisma.submission.create({
        data: {
          tenantId:      user.tenantId,
          publicationId: input.publicationId,
          authorId:      user.id,
          title:         input.title,
          abstract:      input.abstract,
          keywords:      input.keywords,
          coAuthors:     input.coAuthors,
          status:        'DRAFT',
          workflowLogs:  { create: { toStatus: 'DRAFT', performedBy: user.id, note: 'Created' } },
        },
        include: { publication: true },
      })
    }),

  submit: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId, authorId: user.id },
        include: { manuscripts: { where: { isLatest: true } } },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!isValidTransition(sub.status, 'SUBMITTED'))
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid transition' })
      if (sub.manuscripts.length === 0)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload a manuscript file first' })

      const updated = await prisma.submission.update({
        where: { id: input.id },
        data: {
          status: 'SUBMITTED', submittedAt: new Date(),
          workflowLogs: { create: { fromStatus: sub.status, toStatus: 'SUBMITTED', performedBy: user.id } },
        },
      })

      await queues[QUEUES.NOTIFICATION].add('submission-received', {
        type: 'NOTIFICATION', to: [], template: 'SUBMISSION_RECEIVED',
        data: { submissionId: sub.id, title: sub.title },
      })

      return updated
    }),

  makeDecision: chiefEditorProcedure
    .input(z.object({ submissionId: z.string().uuid() }).merge(EditorialDecisionSchema))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      const nextStatus = {
        ACCEPT: 'ACCEPTED', MINOR_REVISION: 'REVISION_REQUIRED',
        MAJOR_REVISION: 'REVISION_REQUIRED', REJECT: 'REJECTED', DESK_REJECT: 'REJECTED',
      }[input.decision] as SubmissionStatus

      await prisma.$transaction([
        prisma.editorialDecision.create({
          data: { submissionId: input.submissionId, editorId: user.id,
                  decision: input.decision, notes: input.notes },
        }),
        prisma.submission.update({
          where: { id: input.submissionId },
          data: {
            status: nextStatus,
            workflowLogs: { create: {
              fromStatus: sub.status, toStatus: nextStatus,
              performedBy: user.id, note: `Decision: ${input.decision}`,
            }},
          },
        }),
      ])

      await queues[QUEUES.NOTIFICATION].add('decision', {
        type: 'NOTIFICATION', to: [], template: 'DECISION_MADE',
        data: { submissionId: input.submissionId, decision: input.decision },
      })

      return { success: true }
    }),

  getUploadUrl: protectedProcedure
    .input(z.object({
      submissionId: z.string().uuid(),
      filename:     z.string(),
      mimeType:     z.string(),
      size:         z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, minio, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      const key = MinioStorage.buildKey(user.tenantId, input.submissionId, input.filename)
      const uploadUrl = await minio.getPresignedUrl(key)

      const fmtMap: Record<string, string> = {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
        'application/x-tex':   'LATEX',
        'text/markdown':       'MARKDOWN',
        'application/vnd.oasis.opendocument.text': 'ODT',
      }

      await prisma.manuscript.updateMany({
        where: { submissionId: input.submissionId, isLatest: true },
        data:  { isLatest: false },
      })

      const ms = await prisma.manuscript.create({
        data: {
          submissionId:  input.submissionId,
          format:        (fmtMap[input.mimeType] ?? 'DOCX') as ManuscriptFormat,
          minioPath:     `s3://pubflow-files/${key}`,
          minioKey:      key,
          fileSizeBytes: input.size,
          isLatest:      true,
        },
      })

      return { manuscriptId: ms.id, uploadUrl, key }
    }),

  confirmUpload: protectedProcedure
    .input(z.object({
      submissionId: z.string().uuid(),
      manuscriptId: z.string().uuid(),
      minioKey: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, minio, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found' })

      // Verify manuscript exists and belongs to this submission
      const ms = await prisma.manuscript.findFirst({
        where: { id: input.manuscriptId, submissionId: input.submissionId },
      })
      if (!ms) throw new TRPCError({ code: 'NOT_FOUND', message: 'Manuscript not found' })

      // Verify file exists in MinIO
      try {
        const stat = await minio.client.statObject(minio.bucket, input.minioKey)
        if (!stat) throw new Error('File not found in MinIO')
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'File upload verification failed' })
      }

      // Create an Output record to track normalization result
      const output = await prisma.output.create({
        data: {
          submissionId: input.submissionId,
          format: 'DOCX',
          engine: 'PANDOC',
          minioKey: '',
          status: 'QUEUED',
        },
      })

      // Queue Pandoc normalization job (processor expects a valid outputId)
      await queues[QUEUES.PANDOC].add('normalize-manuscript', {
        type: 'PANDOC',
        submissionId: input.submissionId,
        outputId: output.id,
        inputMinioKey: input.minioKey,
        inputFormat: (ms.format as string).toLowerCase(),
        outputFormat: 'docx', // Normalize to DOCX
        options: { citationStyle: 'apa' },
      })

      return { success: true, manuscriptId: input.manuscriptId, outputId: output.id }
    }),

  updateDraft: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }).merge(z.object({
      title: z.string().min(10).max(500).optional(),
      abstract: z.string().min(50).max(5000).optional(),
      keywords: z.array(z.string().min(2).max(50)).min(1).max(10).optional(),
      coAuthors: z.array(z.object({
        name: z.string(),
        email: z.string().email(),
        affiliation: z.string().optional(),
        orcid: z.string().optional(),
      })).optional(),
    })))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId, authorId: user.id, status: 'DRAFT' },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found or not in DRAFT status' })

      return prisma.submission.update({
        where: { id: input.id },
        data: {
          title: input.title ?? sub.title,
          abstract: input.abstract ?? sub.abstract,
          keywords: input.keywords ?? sub.keywords,
          coAuthors: (input.coAuthors ?? sub.coAuthors) as any,
        },
      })
    }),

  deleteDraft: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId, authorId: user.id, status: 'DRAFT' },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found or not in DRAFT status' })

      await prisma.submission.delete({ where: { id: input.id } })
      return { success: true }
    }),

  getWorkflowHistory: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (user.role === 'AUTHOR' && sub.authorId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })

      return prisma.workflowLog.findMany({
        where: { submissionId: input.id },
        include: { submission: { select: { title: true } } },
        orderBy: { createdAt: 'asc' },
      })
    }),

  getManuscriptEditorUrl: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma, minio } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found' })

      // Author can only edit their own DRAFT submissions
      if (user.role === 'AUTHOR' && (sub.authorId !== user.id || sub.status !== 'DRAFT')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot edit this submission' })
      }

      // Get the latest manuscript
      const manuscript = await prisma.manuscript.findFirst({
        where: { submissionId: input.submissionId, isLatest: true },
        orderBy: { uploadedAt: 'desc' },
      })
      if (!manuscript) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No manuscript uploaded yet' })
      }

      // Get presigned URL for the manuscript file
      const presignedUrl = await minio.client.presignedGetObject(minio.bucket, manuscript.minioKey, 900)

      // Generate OnlyOffice JWT token
      const jwtSecret = process.env.ONLYOFFICE_JWT_SECRET || 'default-secret'
      const payload = {
        document: {
          fileType: 'docx',
          key: input.submissionId,
          title: sub.title || 'Manuscript',
          url: presignedUrl,
        },
        editorConfig: {
          callbackUrl: `${process.env.API_URL || 'http://localhost:3001'}/wopi/callback/${input.submissionId}`,
          user: {
            id: user.id,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            email: user.email,
          },
          customization: {
            autosave: true,
            forcesave: false,
            commentAuthorOnly: false,
          },
        },
        permissions: {
          comment: true,
          download: true,
          edit: sub.status === 'DRAFT',
          print: true,
          review: false,
        },
      }

      const token = createHmac('sha256', jwtSecret)
        .update(JSON.stringify(payload))
        .digest('hex')

      return {
        onlyofficeUrl: process.env.ONLYOFFICE_URL || 'http://localhost:8081',
        config: payload,
        token,
      }
    }),

  getManuscriptVersions: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      // Authors can only see their own manuscript versions
      if (user.role === 'AUTHOR' && sub.authorId !== user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      const manuscripts = await prisma.manuscript.findMany({
        where: { submissionId: input.submissionId },
        orderBy: { version: 'desc' },
      })

      return manuscripts
    }),
})
