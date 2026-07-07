import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/procedures.js'
import { MinioStorage } from '../plugins/minio.js'

export const assetRouter = router({
  // List assets for a submission
  listForSubmission: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const submission = await ctx.prisma.submission.findUniqueOrThrow({
        where: { id: input.submissionId },
      })

      // Only author and editors can view assets
      if (submission.authorId !== ctx.user.id && ctx.user.role !== 'EDITOR_IN_CHIEF' && ctx.user.role !== 'SECTION_EDITOR') {
        throw new Error('Not authorized to view assets for this submission')
      }

      return ctx.prisma.asset.findMany({
        where: { submissionId: input.submissionId },
        include: { uploadedBy: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { uploadedAt: 'desc' },
      })
    }),

  // Get single asset details
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const asset = await ctx.prisma.asset.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          submission: true,
          uploadedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      })

      // Verify access
      if (
        asset.submission.authorId !== ctx.user.id &&
        ctx.user.role !== 'EDITOR_IN_CHIEF' &&
        ctx.user.role !== 'SECTION_EDITOR' &&
        ctx.user.role !== 'ARTWORK_EDITOR'
      ) {
        throw new Error('Not authorized to view this asset')
      }

      return asset
    }),

  // Get presigned URL for asset upload
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        submissionId: z.string().uuid(),
        filename: z.string().min(1),
        mimeType: z.string(),
        assetType: z.enum(['FIGURE', 'TABLE', 'SUPPLEMENTARY', 'GRAPHICAL_ABSTRACT', 'COVER']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const submission = await ctx.prisma.submission.findUniqueOrThrow({
        where: { id: input.submissionId },
        include: { publication: { select: { title: true, publisher: { select: { name: true } } } } },
      })

      // Only author and artwork editor can upload
      if (submission.authorId !== ctx.user.id && ctx.user.role !== 'ARTWORK_EDITOR') {
        throw new Error('Not authorized to upload assets for this submission')
      }

      // DRAFT/SUBMITTED: authors attach figures, supplementary material and the
      // graphical abstract with the manuscript so the intake bot can classify
      // them. ACCEPTED/ARTWORK_PROCESSING: production-stage artwork uploads.
      const UPLOAD_STATUSES = ['DRAFT', 'SUBMITTED', 'ACCEPTED', 'ARTWORK_PROCESSING']
      if (!UPLOAD_STATUSES.includes(submission.status)) {
        throw new Error(`Asset upload not allowed while submission is ${submission.status}`)
      }

      // Assets live under the same publisher/journal tree as the manuscript:
      // {tenant}/{publisher}/{journal}/{submission}/assets/{file}
      const minioKey = MinioStorage.buildKey(
        submission.tenantId, input.submissionId, input.filename, {
          publisher: submission.publication?.publisher?.name,
          journal:   submission.publication?.title,
          subfolder: 'assets',
        })

      const url = await ctx.minio.getPresignedUrl(minioKey)

      return { url, minioKey, uploadPath: minioKey }
    }),

  // Confirm asset upload and queue processing
  confirmUpload: protectedProcedure
    .input(
      z.object({
        submissionId: z.string().uuid(),
        assetId: z.string().uuid(),
        minioKey: z.string(),
        filename: z.string().min(1),
        mimeType: z.string(),
        fileSizeBytes: z.number().min(1),
        assetType: z.enum(['FIGURE', 'TABLE', 'SUPPLEMENTARY', 'GRAPHICAL_ABSTRACT', 'COVER']),
        figureLabel: z.string().optional(),
        altText: z.string().optional(),
        caption: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const submission = await ctx.prisma.submission.findUniqueOrThrow({
        where: { id: input.submissionId },
      })

      if (submission.authorId !== ctx.user.id && ctx.user.role !== 'ARTWORK_EDITOR') {
        throw new Error('Not authorized to confirm uploads for this submission')
      }

      // Update or create asset
      const asset = await ctx.prisma.asset.upsert({
        where: { id: input.assetId },
        create: {
          id: input.assetId,
          submissionId: input.submissionId,
          uploadedById: ctx.user.id,
          filename: input.filename,
          assetType: input.assetType,
          minioKey: input.minioKey,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
          figureLabel: input.figureLabel,
          altText: input.altText,
          caption: input.caption,
          status: 'PENDING',
        },
        update: {
          minioKey: input.minioKey,
          filename: input.filename,
          fileSizeBytes: input.fileSizeBytes,
          figureLabel: input.figureLabel,
          altText: input.altText,
          caption: input.caption,
          uploadedAt: new Date(),
          status: 'PENDING',
        },
      })

      // Queue image processing job
      await ctx.queues.image.add('image-process', {
        type: 'IMAGE',
        assetId: input.assetId,
        submissionId: input.submissionId,
        inputMinioKey: input.minioKey,
        tasks: ['VALIDATE_DPI', 'VALIDATE_COLORMODE', 'EXTRACT_METADATA', 'GENERATE_THUMBNAIL'],
        targetDpi: 300,
        targetColorMode: 'CMYK',
      })

      return asset
    }),

  // Run the intake classifier over all of a submission's uploaded files. It
  // separates SUPPLEMENTARY material and the single GRAPHICAL_ABSTRACT and links
  // them to the submission so they ride along with the final deliverable.
  classifyIntake: protectedProcedure
    .input(z.object({
      submissionId: z.string().uuid(),
      useVision: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const submission = await ctx.prisma.submission.findUniqueOrThrow({
        where: { id: input.submissionId },
      })

      const isEditor = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SECTION_EDITOR', 'ARTWORK_EDITOR'].includes(ctx.user.role)
      if (submission.authorId !== ctx.user.id && !isEditor) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized to classify this submission' })
      }

      const assets = await ctx.prisma.asset.findMany({
        where: { submissionId: input.submissionId },
        select: {
          id: true, minioKey: true, filename: true,
          mimeType: true, fileSizeBytes: true, uploadedById: true,
        },
      })
      if (assets.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No uploaded files to classify' })
      }

      await ctx.queues.intake.add('classify-intake', {
        type: 'INTAKE',
        submissionId: input.submissionId,
        useVision: input.useVision,
        files: assets.map((a) => ({
          assetId: a.id,
          minioKey: a.minioKey,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.fileSizeBytes,
          uploadedById: a.uploadedById,
        })),
      })

      return { queued: assets.length }
    }),

  // Approve asset (editors only)
  approve: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ARTWORK_EDITOR' && ctx.user.role !== 'SECTION_EDITOR' && ctx.user.role !== 'EDITOR_IN_CHIEF') {
        throw new Error('Only artwork editors can approve assets')
      }

      const asset = await ctx.prisma.asset.update({
        where: { id: input.id },
        data: { status: 'APPROVED' },
      })

      return asset
    }),

  // Reject asset with revision feedback (editors only)
  reject: protectedProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ARTWORK_EDITOR' && ctx.user.role !== 'SECTION_EDITOR' && ctx.user.role !== 'EDITOR_IN_CHIEF') {
        throw new Error('Only artwork editors can reject assets')
      }

      const asset = await ctx.prisma.asset.update({
        where: { id: input.id },
        data: {
          status: 'NEEDS_REVISION',
          metadata: {
            rejectionReason: input.reason,
            rejectedAt: new Date().toISOString(),
          },
        },
      })

      return asset
    }),

  // List all assets across submissions (for artwork editors/section editors)
  listAll: protectedProcedure
    .input(z.object({
      status: z.enum(['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'NEEDS_REVISION']).optional(),
      assetType: z.enum(['FIGURE', 'TABLE', 'SUPPLEMENTARY', 'GRAPHICAL_ABSTRACT', 'COVER']).optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const allowed = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SECTION_EDITOR', 'ARTWORK_EDITOR']
      if (!allowed.includes(ctx.user.role))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only editors can list all assets' })

      const where: Record<string, unknown> = {
        submission: { tenantId: ctx.user.tenantId },
      }
      if (input.status) where['status'] = input.status
      if (input.assetType) where['assetType'] = input.assetType

      const [assets, total] = await Promise.all([
        ctx.prisma.asset.findMany({
          where,
          include: {
            submission: { select: { id: true, title: true, status: true } },
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { uploadedAt: 'desc' },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        ctx.prisma.asset.count({ where }),
      ])

      return { assets, total, page: input.page, limit: input.limit }
    }),

  // Delete asset (author/editor only)
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await ctx.prisma.asset.findUniqueOrThrow({ where: { id: input.id } })

      // Only uploader or editors can delete
      if (asset.uploadedById !== ctx.user.id && ctx.user.role !== 'ARTWORK_EDITOR' && ctx.user.role !== 'SECTION_EDITOR' && ctx.user.role !== 'EDITOR_IN_CHIEF') {
        throw new Error('Not authorized to delete this asset')
      }

      await ctx.prisma.asset.delete({ where: { id: input.id } })

      return { success: true }
    }),
})
