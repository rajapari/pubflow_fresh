import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, editorProcedure } from '../trpc/procedures.js'
import { QUEUES } from '@pubflow/types'
import { MinioStorage } from '../plugins/minio.js'
import { dispatchCopyEditStyleBot } from '../lib/bot-dispatch.js'

const COPY_EDITOR_ROLES = ['EDITOR_IN_CHIEF', 'SECTION_EDITOR', 'COPY_EDITOR'] as const

export const copyEditRouter = router({

  assign: editorProcedure
    .input(z.object({
      submissionId: z.string().uuid(),
      editorId:     z.string().uuid(),
      notes:        z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx

      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
        include: { author: true },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (sub.status !== 'ACCEPTED' && sub.status !== 'COPY_EDITING')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Submission must be ACCEPTED or COPY_EDITING' })

      const copyEditor = await prisma.user.findFirst({
        where: { id: input.editorId, tenantId: user.tenantId, role: 'COPY_EDITOR' },
      })
      if (!copyEditor) throw new TRPCError({ code: 'NOT_FOUND', message: 'Copy editor not found' })

      const copyEdit = await prisma.copyEdit.create({
        data: {
          submissionId: input.submissionId,
          editorId:     input.editorId,
          editorNotes:  input.notes,
        },
        include: {
          editor:     { select: { id: true, firstName: true, lastName: true, email: true } },
          submission: { select: { id: true, title: true, status: true } },
        },
      })

      // Transition submission to COPY_EDITING if it was ACCEPTED
      if (sub.status === 'ACCEPTED') {
        await prisma.submission.update({
          where: { id: input.submissionId },
          data: {
            status: 'COPY_EDITING',
            workflowLogs: { create: {
              fromStatus: sub.status,
              toStatus: 'COPY_EDITING',
              performedBy: user.id,
              note: `Copy editor assigned: ${copyEditor.email}`,
            }},
          },
        })
      }

      await queues[QUEUES.NOTIFICATION].add('copy-edit-assigned', {
        type: 'NOTIFICATION',
        to: [copyEditor.email],
        template: 'COPY_EDIT_ASSIGNED',
        data: { submissionId: input.submissionId, title: sub.title, copyEditId: copyEdit.id },
      })

      // Auto-run the style-manual bot so the copyeditor starts with a report.
      await dispatchCopyEditStyleBot(prisma, queues, {
        copyEditId:    copyEdit.id,
        submissionId:  input.submissionId,
        tenantId:      user.tenantId,
        publicationId: sub.publicationId,
      })

      return copyEdit
    }),

  list: protectedProcedure
    .input(z.object({
      page:  z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      if (!COPY_EDITOR_ROLES.includes(user.role as typeof COPY_EDITOR_ROLES[number])) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      const where =
        user.role === 'COPY_EDITOR'
          ? { editorId: user.id }
          : { submission: { tenantId: user.tenantId } }

      const [copyEdits, total] = await Promise.all([
        prisma.copyEdit.findMany({
          where,
          include: {
            editor:     { select: { id: true, firstName: true, lastName: true, email: true } },
            submission: {
              select: {
                id: true, title: true, status: true,
                publication: { select: { id: true, title: true } },
                author: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip:  (input.page - 1) * input.limit,
          take:  input.limit,
        }),
        prisma.copyEdit.count({ where }),
      ])

      return { copyEdits, total, page: input.page, limit: input.limit }
    }),

  listForSubmission: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      return prisma.copyEdit.findMany({
        where: { submissionId: input.submissionId },
        include: {
          editor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const ce = await prisma.copyEdit.findUnique({
        where: { id: input.id },
        include: {
          editor:     { select: { id: true, firstName: true, lastName: true, email: true } },
          submission: {
            include: {
              manuscripts: { where: { isLatest: true }, take: 1 },
              publication: { select: { id: true, title: true } },
              author:      { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
      })
      if (!ce) throw new TRPCError({ code: 'NOT_FOUND' })
      if (ce.submission.tenantId !== user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      if (user.role === 'COPY_EDITOR' && ce.editorId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })

      return ce
    }),

  start: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const ce = await prisma.copyEdit.findUnique({ where: { id: input.id } })
      if (!ce) throw new TRPCError({ code: 'NOT_FOUND' })
      if (ce.editorId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })
      if (ce.status !== 'ASSIGNED')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Copy edit must be ASSIGNED to start' })

      return prisma.copyEdit.update({
        where: { id: input.id },
        data: { status: 'IN_PROGRESS' },
      })
    }),

  getUploadUrl: protectedProcedure
    .input(z.object({
      id:       z.string().uuid(),
      filename: z.string(),
      mimeType: z.string(),
      size:     z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, minio } = ctx
      const ce = await prisma.copyEdit.findUnique({
        where: { id: input.id },
        include: { submission: { select: { tenantId: true } } },
      })
      if (!ce) throw new TRPCError({ code: 'NOT_FOUND' })
      if (ce.editorId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })
      if (!['IN_PROGRESS', 'REVISION_REQUESTED'].includes(ce.status))
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Must be IN_PROGRESS or REVISION_REQUESTED' })

      const key = MinioStorage.buildKey(
        ce.submission.tenantId,
        ce.submissionId,
        `copy-edit/${ce.id}/${input.filename}`,
      )
      const uploadUrl = await minio.getPresignedUrl(key)
      return { uploadUrl, minioKey: key }
    }),

  submitEdited: protectedProcedure
    .input(z.object({
      id:       z.string().uuid(),
      minioKey: z.string(),
      comments: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const ce = await prisma.copyEdit.findUnique({ where: { id: input.id } })
      if (!ce) throw new TRPCError({ code: 'NOT_FOUND' })
      if (ce.editorId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })
      if (!['IN_PROGRESS', 'REVISION_REQUESTED'].includes(ce.status))
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot submit from current status' })

      return prisma.copyEdit.update({
        where: { id: input.id },
        data: {
          status:      'SUBMITTED',
          editedKey:   input.minioKey,
          comments:    input.comments,
          submittedAt: new Date(),
        },
      })
    }),

  // Run the automated style-manual bot (APA/Chicago/AMA/… or in-house) over
  // the manuscript. Results land in CopyEdit.botReport for the copyeditor to
  // review — suggestions are never auto-applied.
  runStyleBot: protectedProcedure
    .input(z.object({
      id:             z.string().uuid(),
      styleProfileId: z.string().uuid().optional(),
      styleManual:    z.enum(['INHOUSE','APA7','CHICAGO17','AMA11','MLA9','VANCOUVER','IEEE','CSE','HARVARD']).optional(),
      applyAi:        z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const ce = await prisma.copyEdit.findUnique({
        where: { id: input.id },
        include: {
          submission: {
            include: {
              manuscripts: { where: { isLatest: true }, take: 1 },
              publication: { select: { id: true } },
            },
          },
        },
      })
      if (!ce) throw new TRPCError({ code: 'NOT_FOUND' })
      if (ce.submission.tenantId !== user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      if (ce.editorId !== user.id && !COPY_EDITOR_ROLES.includes(user.role as typeof COPY_EDITOR_ROLES[number]))
        throw new TRPCError({ code: 'FORBIDDEN' })

      // Prefer the copyeditor's edited file; fall back to the latest manuscript.
      const manuscript = ce.submission.manuscripts[0]
      const inputMinioKey = ce.editedKey ?? manuscript?.minioKey
      if (!inputMinioKey)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No manuscript file to analyze' })

      const FORMAT_MAP: Record<string, 'docx'|'markdown'|'latex'|'odt'> = {
        DOCX: 'docx', LATEX: 'latex', MARKDOWN: 'markdown', ODT: 'odt',
      }
      const inputFormat = FORMAT_MAP[manuscript?.format ?? 'DOCX']
      if (!inputFormat)
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unsupported manuscript format: ${manuscript?.format}` })

      // Resolve default style profile: explicit input > publication default > tenant default.
      let styleProfileId = input.styleProfileId
      if (!styleProfileId && !input.styleManual) {
        const profile = await prisma.styleProfile.findFirst({
          where: {
            tenantId: user.tenantId,
            OR: [{ publicationId: ce.submission.publication.id }, { publicationId: null }],
            isDefault: true,
          },
          orderBy: { publicationId: { sort: 'desc', nulls: 'last' } }, // publication-specific first
        })
        styleProfileId = profile?.id
      }

      await queues[QUEUES.COPYEDIT].add('style-bot', {
        type: 'COPYEDIT',
        submissionId: ce.submissionId,
        copyEditId: ce.id,
        inputMinioKey,
        inputFormat,
        styleProfileId,
        styleManual: input.styleManual ?? 'INHOUSE',
        cslStyle: 'apa',
        houseRules: [],
        applyAi: input.applyAi,
      })

      return { queued: true }
    }),

  approve: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const ce = await prisma.copyEdit.findUnique({
        where: { id: input.id },
        include: { submission: true },
      })
      if (!ce) throw new TRPCError({ code: 'NOT_FOUND' })
      if (ce.submission.tenantId !== user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      if (ce.status !== 'SUBMITTED')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Copy edit must be SUBMITTED to approve' })

      await prisma.$transaction([
        prisma.copyEdit.update({
          where: { id: input.id },
          data: { status: 'APPROVED', approvedAt: new Date() },
        }),
        prisma.submission.update({
          where: { id: ce.submissionId },
          data: {
            status: 'ARTWORK_PROCESSING',
            workflowLogs: { create: {
              fromStatus: 'COPY_EDITING',
              toStatus: 'ARTWORK_PROCESSING',
              performedBy: user.id,
              note: 'Copy edit approved',
            }},
          },
        }),
      ])

      return { success: true }
    }),

  requestRevision: editorProcedure
    .input(z.object({
      id:    z.string().uuid(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const ce = await prisma.copyEdit.findUnique({
        where: { id: input.id },
        include: { submission: true },
      })
      if (!ce) throw new TRPCError({ code: 'NOT_FOUND' })
      if (ce.submission.tenantId !== user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      if (ce.status !== 'SUBMITTED')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Copy edit must be SUBMITTED to request revision' })

      return prisma.copyEdit.update({
        where: { id: input.id },
        data: {
          status:      'REVISION_REQUESTED',
          editorNotes: input.notes,
        },
      })
    }),
})
