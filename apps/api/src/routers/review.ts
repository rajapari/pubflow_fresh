import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { AnyRouter } from '@trpc/server'
import { router, protectedProcedure, editorProcedure } from '../trpc/procedures.js'
import { AssignReviewerSchema, SubmitReviewSchema, AcceptReviewSchema, DeclineReviewSchema } from '@pubflow/types'
import { QUEUES } from '@pubflow/types'

export const reviewRouter: ReturnType<typeof router> = router({

  list: protectedProcedure
    .input(z.object({
      status: z.enum(['INVITED', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'SUBMITTED', 'OVERDUE']).optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx

      // Only PEER_REVIEWERs can see their assigned reviews
      if (user.role !== 'PEER_REVIEWER' && user.role !== 'EDITOR_IN_CHIEF' && user.role !== 'SECTION_EDITOR') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only reviewers can list reviews' })
      }

      const where: Record<string, unknown> = { tenantId: user.tenantId }
      if (input.status) where['status'] = input.status
      if (user.role === 'PEER_REVIEWER') where['reviewerId'] = user.id

      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where: {
            AND: [
              user.role === 'PEER_REVIEWER' ? { reviewerId: user.id } : {},
              input.status ? { status: input.status } : {},
            ],
            submission: { tenantId: user.tenantId },
          },
          include: {
            submission: {
              select: {
                id: true,
                title: true,
                status: true,
                createdAt: true,
                author: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
            reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        prisma.review.count({
          where: {
            AND: [
              user.role === 'PEER_REVIEWER' ? { reviewerId: user.id } : {},
              input.status ? { status: input.status } : {},
            ],
            submission: { tenantId: user.tenantId },
          },
        }),
      ])

      return { reviews, total, page: input.page, limit: input.limit }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const review = await prisma.review.findUnique({
        where: { id: input.id },
        include: {
          submission: {
            select: {
              id: true,
              title: true,
              status: true,
              abstract: true,
              createdAt: true,
              author: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      })
      if (!review) throw new TRPCError({ code: 'NOT_FOUND' })
      
      // Tenant isolation + role check
      const submission = await prisma.submission.findUnique({
        where: { id: review.submissionId },
      })
      if (!submission || submission.tenantId !== user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })
      
      // Only reviewer or editors can see a review
      if (user.id !== review.reviewerId && !['EDITOR_IN_CHIEF', 'SECTION_EDITOR'].includes(user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      return review
    }),

  assignReviewer: editorProcedure
    .input(AssignReviewerSchema)
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
        include: { author: true },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found' })

      const reviewer = await prisma.user.findFirst({
        where: { id: input.reviewerId, tenantId: user.tenantId, role: 'PEER_REVIEWER' },
      })
      if (!reviewer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Reviewer not found' })

      const review = await prisma.review.create({
        data: {
          submissionId: input.submissionId,
          reviewerId: input.reviewerId,
          status: 'INVITED',
          dueAt: input.dueAt,
        },
        include: { submission: true, reviewer: true },
      })

      // Queue notification
      await queues[QUEUES.NOTIFICATION].add('review-invited', {
        type: 'NOTIFICATION',
        to: [reviewer.email],
        template: 'REVIEW_INVITED',
        data: { title: sub.title, reviewId: review.id, submissionId: sub.id },
      })

      return review
    }),

  acceptInvitation: protectedProcedure
    .input(AcceptReviewSchema)
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const review = await prisma.review.findUnique({ where: { id: input.reviewId } })
      if (!review) throw new TRPCError({ code: 'NOT_FOUND' })
      if (review.reviewerId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })
      if (review.status !== 'INVITED') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Review not in INVITED status' })

      return prisma.review.update({
        where: { id: input.reviewId },
        data: { status: 'ACCEPTED' },
      })
    }),

  declineInvitation: protectedProcedure
    .input(DeclineReviewSchema)
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const review = await prisma.review.findUnique({ where: { id: input.reviewId } })
      if (!review) throw new TRPCError({ code: 'NOT_FOUND' })
      if (review.reviewerId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })
      if (review.status !== 'INVITED') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Review not in INVITED status' })

      return prisma.review.update({
        where: { id: input.reviewId },
        data: { status: 'DECLINED' },
      })
    }),

  submit: protectedProcedure
    .input(SubmitReviewSchema)
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const review = await prisma.review.findUnique({
        where: { id: input.reviewId },
        include: { submission: { include: { author: true } } },
      })
      if (!review) throw new TRPCError({ code: 'NOT_FOUND' })
      if (review.reviewerId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })
      if (!['INVITED', 'ACCEPTED', 'IN_PROGRESS'].includes(review.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Review cannot be submitted from ${review.status} status` })
      }

      const updated = await prisma.review.update({
        where: { id: input.reviewId },
        data: {
          status: 'SUBMITTED',
          recommendation: input.recommendation,
          comments: input.comments,
          confidentialNotes: input.confidentialNotes,
          submittedAt: new Date(),
        },
      })

      // Notify editor that review was submitted
      const editors = await prisma.user.findMany({
        where: { tenantId: user.tenantId, role: { in: ['EDITOR_IN_CHIEF', 'SECTION_EDITOR'] } },
      })

      await queues[QUEUES.NOTIFICATION].add('review-submitted', {
        type: 'NOTIFICATION',
        to: editors.map(e => e.email),
        template: 'REVIEW_INVITED',
        data: { title: review.submission.title, reviewId: review.id, submissionId: review.submissionId },
      })

      return updated
    }),

  listForSubmission: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const submission = await prisma.submission.findUnique({
        where: { id: input.submissionId },
      })
      if (!submission) throw new TRPCError({ code: 'NOT_FOUND' })
      if (submission.tenantId !== user.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })

      // Authors can only see reviews after decision is made (not during PEER_REVIEW)
      const isAuthor = submission.authorId === user.id
      const canViewReviews = !isAuthor || submission.status !== 'PEER_REVIEW'
      if (!canViewReviews && isAuthor) {
        return []
      }

      // Editors and reviewers can see all. Authors see only SUBMITTED reviews (hidden comments until release)
      const reviews = await prisma.review.findMany({
        where: { submissionId: input.submissionId },
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
      })

      // For authors: mask confidential comments, only show public comments
      if (isAuthor) {
        return reviews.map((r) => ({
          ...r,
          confidentialComments: null, // Authors don't see editor-only comments
        }))
      }

      return reviews
    }),
})
