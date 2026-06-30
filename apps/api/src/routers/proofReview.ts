import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/procedures.js'
import { QUEUES } from '@pubflow/types'

export const proofReviewRouter = router({
  // List all proof reviews for a submission
  listForSubmission: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const submission = await ctx.prisma.submission.findUniqueOrThrow({
        where: { id: input.submissionId },
      })

      // Only editor or author can view proof reviews
      const isAuthor = submission.authorId === ctx.user.id
      const isEditor = ctx.user.role === 'EDITOR_IN_CHIEF' || ctx.user.role === 'SECTION_EDITOR'
      if (!isAuthor && !isEditor) {
        throw new Error('Not authorized to view proof reviews for this submission')
      }

      const reviews = await ctx.prisma.proofReview.findMany({
        where: { submissionId: input.submissionId },
        include: {
          reviewer: { select: { id: true, email: true, firstName: true, lastName: true } },
          output: { select: { id: true, format: true, status: true, generatedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      return reviews.map(r => ({
        ...r,
        // Authors see minimal info during PROOF_REVIEW status
        comments: isAuthor ? null : r.comments,
      }))
    }),

  // Get a single proof review with full details
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const review = await ctx.prisma.proofReview.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          submission: true,
          reviewer: { select: { id: true, email: true, firstName: true, lastName: true } },
          output: true,
        },
      })

      // Verify access
      const isAuthor = review.submission.authorId === ctx.user.id
      const isReviewer = review.reviewerId === ctx.user.id
      const isEditor = ctx.user.role === 'EDITOR_IN_CHIEF' || ctx.user.role === 'SECTION_EDITOR'

      if (!isAuthor && !isReviewer && !isEditor) {
        throw new Error('Not authorized to view this proof review')
      }

      return {
        ...review,
        comments: isAuthor ? null : review.comments,
      }
    }),

  // Assign a proof reviewer
  assign: protectedProcedure
    .input(
      z.object({
        submissionId: z.string().uuid(),
        reviewerId: z.string().uuid(),
        round: z.number().min(1).default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'EDITOR_IN_CHIEF' && ctx.user.role !== 'SECTION_EDITOR') {
        throw new Error('Only editors can assign proof reviewers')
      }

      const submission = await ctx.prisma.submission.findUniqueOrThrow({
        where: { id: input.submissionId },
        include: { author: true },
      })

      if (submission.status !== 'TYPESETTING' && submission.status !== 'PROOF_REVIEW') {
        throw new Error('Submission must be in TYPESETTING or PROOF_REVIEW status for proof review')
      }

      const reviewer = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: input.reviewerId },
      })

      if (!['SECTION_EDITOR', 'EDITOR_IN_CHIEF', 'PROOF_READER'].includes(reviewer.role)) {
        throw new Error('User must be SECTION_EDITOR, EDITOR_IN_CHIEF, or PROOF_READER')
      }

      const existing = await ctx.prisma.proofReview.findFirst({
        where: {
          submissionId: input.submissionId,
          reviewerId: input.reviewerId,
          round: input.round,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
      })

      if (existing) {
        throw new Error('This reviewer already has an open proof review for this round')
      }

      const review = await ctx.prisma.proofReview.create({
        data: {
          submissionId: input.submissionId,
          reviewerId: input.reviewerId,
          round: input.round,
          status: 'OPEN',
        },
        include: {
          reviewer: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      })

      await ctx.prisma.workflowLog.create({
        data: {
          submissionId: input.submissionId,
          toStatus: 'PROOF_REVIEW',
          performedBy: ctx.user.id,
          note: `Assigned proof reviewer: ${reviewer.email}`,
          metadata: { reviewerId: input.reviewerId, round: input.round },
        },
      })

      // Notify the author that their proof is ready for review
      await ctx.queues[QUEUES.NOTIFICATION].add('proof-ready', {
        type: 'NOTIFICATION',
        to: [submission.author.email],
        template: 'PROOF_READY',
        data: { submissionId: input.submissionId, title: submission.title },
      })

      return review
    }),

  // Submit a proof review
  submit: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        comments: z.string().optional(),
        status: z.enum(['APPROVED', 'REJECTED', 'NEEDS_REVISION']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const review = await ctx.prisma.proofReview.findUniqueOrThrow({
        where: { id: input.id },
      })

      // Only the assigned reviewer can submit
      if (review.reviewerId !== ctx.user.id) {
        throw new Error('Only the assigned reviewer can submit this proof review')
      }

      if (review.status === 'SUBMITTED') {
        throw new Error('This proof review has already been submitted')
      }

      const updatedReview = await ctx.prisma.proofReview.update({
        where: { id: input.id },
        data: {
          status: 'SUBMITTED',
          comments: input.comments,
          submittedAt: new Date(),
        },
        include: {
          submission: true,
          reviewer: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      })

      // Log the submission
      await ctx.prisma.workflowLog.create({
        data: {
          submissionId: review.submissionId,
          toStatus: updatedReview.submission.status,
          performedBy: ctx.user.id,
          note: `Proof review submitted: ${input.status}`,
          metadata: {
            reviewId: input.id,
            decision: input.status,
            hasComments: !!input.comments,
          },
        },
      })

      // If all proof reviews are submitted, transition to next status
      const allReviews = await ctx.prisma.proofReview.findMany({
        where: { submissionId: review.submissionId, round: review.round },
      })

      const allSubmitted = allReviews.every(r => r.status === 'SUBMITTED' || r.id === input.id)
      if (allSubmitted) {
        const hasRejections = allReviews.some(
          r => r.id === input.id ? input.status === 'REJECTED' : r.status === 'REJECTED'
        )
        const nextStatus = hasRejections ? 'REVISION_REQUIRED' : 'APPROVED'

        const updatedSub = await ctx.prisma.submission.update({
          where: { id: review.submissionId },
          data: { status: nextStatus },
          include: { author: true },
        })

        if (nextStatus === 'REVISION_REQUIRED') {
          await ctx.queues[QUEUES.NOTIFICATION].add('proof-revision-requested', {
            type: 'NOTIFICATION',
            to: [updatedSub.author.email],
            template: 'REVISION_REQUESTED',
            data: { submissionId: review.submissionId, title: updatedSub.title },
          })
        }
      }

      return updatedReview
    }),

  // List all proof reviews across submissions (for editors)
  listAll: protectedProcedure
    .input(z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'NEEDS_REVISION', 'SUBMITTED']).optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const isEditor = ctx.user.role === 'EDITOR_IN_CHIEF' || ctx.user.role === 'SECTION_EDITOR' || ctx.user.role === 'SUPER_ADMIN'
      if (!isEditor)
        throw new Error('Only editors can list all proof reviews')

      const where: Record<string, unknown> = {
        submission: { tenantId: ctx.user.tenantId },
      }
      if (input.status) where['status'] = input.status

      const [reviews, total] = await Promise.all([
        ctx.prisma.proofReview.findMany({
          where,
          include: {
            submission: { select: { id: true, title: true, status: true } },
            reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
            output: { select: { id: true, format: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        ctx.prisma.proofReview.count({ where }),
      ])

      return { reviews, total, page: input.page, limit: input.limit }
    }),

  // Get a presigned download URL for a typeset output
  getDownloadUrl: protectedProcedure
    .input(z.object({ outputId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma, minio } = ctx
      const output = await prisma.output.findUniqueOrThrow({ where: { id: input.outputId } })
      const sub = await prisma.submission.findUnique({ where: { id: output.submissionId } })
      if (sub?.tenantId !== user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      if (!output.minioKey) throw new TRPCError({ code: 'NOT_FOUND', message: 'Output file not yet available' })

      const url = await minio.client.presignedGetObject(minio.bucket, output.minioKey, 3600)
      return { url, format: output.format }
    }),

  // Get list of outputs (to link with proof review)
  listOutputs: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const submission = await ctx.prisma.submission.findUniqueOrThrow({
        where: { id: input.submissionId },
      })

      // Only editors/authors can list outputs
      const isAuthor = submission.authorId === ctx.user.id
      const isEditor = ctx.user.role === 'EDITOR_IN_CHIEF' || ctx.user.role === 'SECTION_EDITOR'
      if (!isAuthor && !isEditor) {
        throw new Error('Not authorized')
      }

      return ctx.prisma.output.findMany({
        where: { submissionId: input.submissionId, status: 'COMPLETED' },
        orderBy: { generatedAt: 'desc' },
      })
    }),
})
