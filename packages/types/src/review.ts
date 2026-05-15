import { z } from 'zod'

export const ReviewStatusSchema = z.enum([
  'INVITED', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'SUBMITTED', 'OVERDUE',
])
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>

export const ReviewRecommendationSchema = z.enum([
  'ACCEPT', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECT',
])
export type ReviewRecommendation = z.infer<typeof ReviewRecommendationSchema>

export const AssignReviewerSchema = z.object({
  submissionId: z.string().uuid(),
  reviewerId: z.string().uuid(),
  dueAt: z.date().optional(),
})
export type AssignReviewer = z.infer<typeof AssignReviewerSchema>

export const SubmitReviewSchema = z.object({
  reviewId: z.string().uuid(),
  recommendation: ReviewRecommendationSchema,
  comments: z.string().min(10).max(10000),
  confidentialNotes: z.string().max(5000).optional(),
})
export type SubmitReview = z.infer<typeof SubmitReviewSchema>

export const AcceptReviewSchema = z.object({
  reviewId: z.string().uuid(),
})
export type AcceptReview = z.infer<typeof AcceptReviewSchema>

export const DeclineReviewSchema = z.object({
  reviewId: z.string().uuid(),
})
export type DeclineReview = z.infer<typeof DeclineReviewSchema>
