'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/Form'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Loader, CheckCircle, X, Eye } from 'lucide-react'

export default function ProofReviewPage() {
  const params = useParams()
  const submissionId = params.id as string
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)

  const reviewsQuery = trpc.proofReview.listForSubmission.useQuery({ submissionId })
  const outputsQuery = trpc.proofReview.listOutputs.useQuery({ submissionId })
  const submitReviewMutation = trpc.proofReview.submit.useMutation()

  const selectedReview = reviewsQuery.data?.find(r => r.id === selectedReviewId)

  const handleSubmitReview = async (status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION', comments: string) => {
    if (!selectedReviewId) return

    try {
      await submitReviewMutation.mutateAsync({
        id: selectedReviewId,
        status,
        comments: comments || undefined,
      })
      reviewsQuery.refetch()
      setSelectedReviewId(null)
    } catch (err) {
      console.error('Failed to submit review:', err)
    }
  }

  const statusColors: Record<string, string> = {
    OPEN: 'bg-gray-100 text-gray-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
    NEEDS_REVISION: 'bg-yellow-100 text-yellow-800',
    SUBMITTED: 'bg-indigo-100 text-indigo-800',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Proof Review</h1>
        <p className="text-gray-600 mt-2">Review typeset output and approve for publication</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Reviews List */}
        <div className="md:col-span-1 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>

          {reviewsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : reviewsQuery.data && reviewsQuery.data.length > 0 ? (
            reviewsQuery.data.map(review => (
              <button
                key={review.id}
                onClick={() => setSelectedReviewId(review.id)}
                className={`w-full p-4 rounded-lg border-2 transition-colors text-left ${
                  selectedReviewId === review.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-medium text-gray-900 text-sm">
                    {review.reviewer.firstName} {review.reviewer.lastName}
                  </p>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[review.status]}`}>
                    {review.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Round {review.round}</p>
                {review.output && (
                  <p className="text-xs text-gray-600 mt-2">
                    <span className="font-medium">Format:</span> {review.output.format}
                  </p>
                )}
              </button>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No proof reviews assigned</p>
            </div>
          )}
        </div>

        {/* Review Detail / PDF Viewer */}
        <div className="md:col-span-2">
          {selectedReview ? (
            <div className="space-y-6">
              {/* Review Header */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedReview.reviewer.firstName} {selectedReview.reviewer.lastName}
                  </h3>
                  <p className="text-sm text-gray-600">{selectedReview.reviewer.email}</p>
                </div>

                <div className="grid grid-cols-3 gap-4 py-4 border-t border-b border-gray-200">
                  <div>
                    <p className="text-xs text-gray-600">Round</p>
                    <p className="text-lg font-semibold text-gray-900">{selectedReview.round}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Status</p>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[selectedReview.status]}`}>
                      {selectedReview.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Submitted</p>
                    <p className="text-sm text-gray-900">
                      {selectedReview.submittedAt
                        ? new Date(selectedReview.submittedAt).toLocaleDateString()
                        : 'Pending'}
                    </p>
                  </div>
                </div>

                {selectedReview.comments && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-900 mb-2">Comments</p>
                    <p className="text-sm text-gray-700">{selectedReview.comments}</p>
                  </div>
                )}
              </div>

              {/* Output Preview */}
              {selectedReview.output && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Output</h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Format</p>
                      <p className="text-sm text-gray-900">{selectedReview.output.format}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Status</p>
                      <StatusBadge status={selectedReview.output.status} />
                    </div>
                    <button className="w-full px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium text-sm transition-colors flex items-center justify-center gap-2 mt-4">
                      <Eye className="h-4 w-4" />
                      View PDF in Viewer
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons (if in OPEN/IN_PROGRESS status) */}
              {(selectedReview.status === 'OPEN' || selectedReview.status === 'IN_PROGRESS') && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Your Review</h4>
                  <div className="space-y-4">
                    <textarea
                      placeholder="Add your comments and feedback..."
                      className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => handleSubmitReview('APPROVED', '')} variant="outline" className="flex-1">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button onClick={() => handleSubmitReview('NEEDS_REVISION', '')} variant="outline" className="flex-1">
                        Mark for Revision
                      </Button>
                      <Button onClick={() => handleSubmitReview('REJECTED', '')} variant="outline" className="flex-1">
                        <X className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-12 text-center">
              <p className="text-gray-500">Select a review to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
