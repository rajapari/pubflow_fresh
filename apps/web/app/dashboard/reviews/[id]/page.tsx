'use client'

import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/lib/trpc-client'
import { FormField, TextArea, Button } from '@/components/ui/Form'
import { toast } from 'sonner'

const SubmitReviewSchema = z.object({
  recommendation: z.enum(['ACCEPT', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECT']),
  comments: z.string().min(50).max(10000),
  confidentialNotes: z.string().max(5000).optional(),
})

type FormData = z.infer<typeof SubmitReviewSchema>

const RECOMMENDATIONS = {
  ACCEPT: { label: 'Accept', color: 'green' },
  MINOR_REVISION: { label: 'Minor Revision', color: 'blue' },
  MAJOR_REVISION: { label: 'Major Revision', color: 'amber' },
  REJECT: { label: 'Reject', color: 'red' },
}

export default function SubmitReviewPage() {
  const params = useParams()
  const router = useRouter()
  const reviewId = params.id as string

  const review = trpc.review.byId.useQuery({ id: reviewId })
  const submitMutation = trpc.review.submit.useMutation()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(SubmitReviewSchema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      await submitMutation.mutateAsync({
        reviewId,
        ...data,
      })
      toast.success('Review submitted successfully!')
      router.push('/dashboard/reviews')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit review'
      toast.error(message)
    }
  }

  if (review.isLoading) return <div className="p-8">Loading...</div>
  if (!review.data) return <div className="p-8">Review not found</div>
  if (review.data.status !== 'ACCEPTED') {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">Cannot submit review with status: {review.data.status}</p>
        <Button onClick={() => router.back()} className="mt-4">Go Back</Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Submit Review</h1>
      <p className="text-gray-600 mb-8">
        Reviewing: <span className="font-medium">{review.data.submission?.title}</span>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Submission Details</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Title:</span>
              <span className="font-medium">{review.data.submission?.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Author:</span>
              <span className="font-medium">
                {review.data.submission?.author?.firstName} {review.data.submission?.author?.lastName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Submitted:</span>
              <span className="font-medium">
                {new Date(review.data.submission?.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4">Recommendation</label>
            <div className="grid grid-cols-2 gap-4">
              {(Object.entries(RECOMMENDATIONS) as Array<[string, any]>).map(([value, { label, color }]) => (
                <label key={value} className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    value={value}
                    {...register('recommendation')}
                    className="w-4 h-4"
                  />
                  <span className={`ml-3 font-medium text-${color}-700`}>{label}</span>
                </label>
              ))}
            </div>
            {errors.recommendation && (
              <p className="mt-2 text-sm text-red-600">{errors.recommendation.message}</p>
            )}
          </div>

          <TextArea
            label="Comments for Authors"
            placeholder="Provide constructive feedback that will be shared with the authors..."
            rows={8}
            {...register('comments')}
            error={errors.comments?.message}
          />

          <TextArea
            label="Confidential Comments for Editors"
            placeholder="These comments will only be visible to the editors..."
            rows={6}
            {...register('confidentialNotes')}
            error={errors.confidentialNotes?.message}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-medium mb-2">Review Guidelines</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Be professional and constructive in your feedback</li>
              <li>Focus on the quality of the work, not the author</li>
              <li>Provide specific suggestions for improvement</li>
              <li>Highlight both strengths and weaknesses</li>
              <li>Be objective and avoid personal bias</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" loading={isSubmitting}>
            Submit Review
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
