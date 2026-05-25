'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/Form'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { toast } from 'sonner'

interface ReviewWithSubmission {
  id: string
  submissionId: string
  status: string
  recommendation?: string
  comments?: string
  createdAt: Date
  submission?: {
    title: string
    status: string
    author?: {
      firstName: string
      lastName: string
      email: string
    }
  }
}

export default function ReviewsPage() {
  const router = useRouter()
  const [filter, setFilter] = React.useState<'PENDING' | 'ACCEPTED' | 'DECLINED' | 'SUBMITTED' | 'ALL'>('PENDING')

  const reviews = trpc.review.list.useQuery({})
  const acceptMutation = trpc.review.acceptInvitation.useMutation()
  const declineMutation = trpc.review.declineInvitation.useMutation()

  const handleAccept = async (reviewId: string) => {
    try {
      await acceptMutation.mutateAsync({ reviewId })
      toast.success('Review invitation accepted')
      await reviews.refetch()
    } catch (err) {
      toast.error('Failed to accept review')
    }
  }

  const handleDecline = async (reviewId: string) => {
    try {
      await declineMutation.mutateAsync({ reviewId })
      toast.success('Review invitation declined')
      await reviews.refetch()
    } catch (err) {
      toast.error('Failed to decline review')
    }
  }

  const filteredReviews = (reviews.data?.reviews || reviews.data || []) as ReviewWithSubmission[]
  const filtered = filteredReviews.filter((r: any) => {
    if (filter === 'ALL') return true
    return r.status === filter
  })

  if (reviews.isLoading) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">My Reviews</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['PENDING', 'ACCEPTED', 'DECLINED', 'SUBMITTED', 'ALL'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status} {filtered.filter((r: any) => r.status === status).length > 0 && `(${filtered.filter((r: any) => r.status === status).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600">No reviews found for this filter</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Submission</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Author</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Assigned</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((review: any) => (
                <tr key={review.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => router.push(`/dashboard/submissions/${review.submissionId}`)}
                      className="text-blue-600 hover:text-blue-900 font-medium"
                    >
                      {review.submission?.title || 'Unknown'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {review.submission?.author?.firstName} {review.submission?.author?.lastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={review.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    {review.status === 'INVITED' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleAccept(review.id)}
                          disabled={acceptMutation.isPending}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDecline(review.id)}
                          disabled={declineMutation.isPending}
                        >
                          Decline
                        </Button>
                      </>
                    )}
                    {review.status === 'ACCEPTED' && (
                      <Button
                        size="sm"
                        onClick={() => router.push(`/dashboard/reviews/${review.id}`)}
                      >
                        Write Review
                      </Button>
                    )}
                    {review.status === 'SUBMITTED' && (
                      <span className="text-xs text-green-600 font-medium">Submitted ✓</span>
                    )}
                    {review.status === 'DECLINED' && (
                      <span className="text-xs text-gray-600">Declined</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
