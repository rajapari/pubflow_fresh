'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/Form'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { toast } from 'sonner'

interface AssignReviewerModalProps {
  submissionId: string | null
  isOpen: boolean
  onClose: () => void
  onAssign: (reviewerId: string) => Promise<void>
  isLoading: boolean
}

function AssignReviewerModal({ submissionId, isOpen, onClose, onAssign, isLoading }: AssignReviewerModalProps) {
  const [selectedReviewerId, setSelectedReviewerId] = React.useState('')
  const reviewers = trpc.user.list.useQuery({ role: 'PEER_REVIEWER' })

  if (!isOpen || !submissionId) return null

  const handleAssign = async () => {
    if (!selectedReviewerId) {
      toast.error('Please select a reviewer')
      return
    }
    await onAssign(selectedReviewerId)
    setSelectedReviewerId('')
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 shadow-xl max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Reviewer</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Reviewer</label>
            <select
              value={selectedReviewerId}
              onChange={(e) => setSelectedReviewerId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a reviewer...</option>
              {reviewers.data?.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.firstName} {r.lastName} ({r.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              loading={isLoading}
            >
              Assign
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EditorialPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = React.useState<'SUBMITTED' | 'PEER_REVIEW' | 'REVISION_REQUIRED'>('SUBMITTED')
  const [selectedSubmissionId, setSelectedSubmissionId] = React.useState<string | null>(null)
  const [showAssignModal, setShowAssignModal] = React.useState(false)

  const submissions = trpc.submission.list.useQuery({
    status: activeTab,
    limit: 100,
  })

  const assignReviewerMutation = trpc.review.assignReviewer.useMutation()

  const handleAssignReviewer = async (reviewerId: string) => {
    if (!selectedSubmissionId) return
    try {
      await assignReviewerMutation.mutateAsync({
        submissionId: selectedSubmissionId,
        reviewerId,
      })
      toast.success('Reviewer assigned successfully!')
      setShowAssignModal(false)
      setSelectedSubmissionId(null)
      await submissions.refetch()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign reviewer'
      toast.error(message)
    }
  }

  const openAssignModal = (submissionId: string) => {
    setSelectedSubmissionId(submissionId)
    setShowAssignModal(true)
  }

  if (submissions.isLoading) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Editorial Workflow</h1>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(['SUBMITTED', 'PEER_REVIEW', 'REVISION_REQUIRED'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab)
              submissions.refetch()
            }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.replace('_', ' ')} ({submissions.data?.submissions?.length || 0})
          </button>
        ))}
      </div>

      {submissions.data?.submissions?.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600">No submissions in this stage</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Author</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Publication</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Reviews</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {submissions.data?.submissions?.map((sub: any) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => router.push(`/dashboard/submissions/${sub.id}`)}
                      className="text-blue-600 hover:text-blue-900 font-medium max-w-xs truncate"
                    >
                      {sub.title}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {sub.author?.firstName} {sub.author?.lastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {sub.publication?.title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {sub._count?.reviews || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <Button
                      size="sm"
                      onClick={() => router.push(`/dashboard/submissions/${sub.id}`)}
                    >
                      View
                    </Button>
                    {activeTab === 'PEER_REVIEW' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openAssignModal(sub.id)}
                      >
                        Assign Reviewer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssignReviewerModal
        submissionId={selectedSubmissionId}
        isOpen={showAssignModal}
        onClose={() => {
          setShowAssignModal(false)
          setSelectedSubmissionId(null)
        }}
        onAssign={handleAssignReviewer}
        isLoading={assignReviewerMutation.isPending}
      />
    </div>
  )
}
