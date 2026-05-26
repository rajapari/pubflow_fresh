'use client'

import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { WorkflowTimeline } from '@/components/ui/WorkflowTimeline'
import { Button } from '@/components/ui/Form'
import { FileUpload } from '@/components/ui/FileUpload'
import { toast } from 'sonner'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

const RECOMMENDATION_LABELS: Record<string, { label: string; color: string }> = {
  ACCEPT: { label: 'Accept', color: 'green' },
  MINOR_REVISION: { label: 'Minor revision', color: 'blue' },
  MAJOR_REVISION: { label: 'Major revision', color: 'amber' },
  REJECT: { label: 'Reject', color: 'red' },
}

export default function SubmissionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const submissionId = params.id as string

  const submissionQ = trpc.submission.byId.useQuery({ id: submissionId }) as any
  const versionsQ = trpc.submission.getManuscriptVersions.useQuery({ submissionId }, { enabled: !!submissionId }) as any
  const reviewsQ = trpc.review.listForSubmission.useQuery({ submissionId }, { enabled: !!submissionId }) as any
  const workflowQ = trpc.submission.getWorkflowHistory.useQuery({ id: submissionId }, { enabled: !!submissionId }) as any

  const submitMutation = trpc.submission.submit.useMutation()
  const [showUpload, setShowUpload] = useState(false)

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync({ id: submissionId })
      toast.success('Submission sent for editorial review')
      await submissionQ.refetch()
      await reviewsQ.refetch()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit'
      toast.error(message)
    }
  }

  const handleUploadComplete = async () => {
    await Promise.all([submissionQ.refetch(), versionsQ.refetch(), reviewsQ.refetch()])
    setShowUpload(false)
  }

  if (submissionQ.isLoading) return <div className="p-8">Loading...</div>
  if (submissionQ.error) return <div className="p-8 text-red-600">Error loading submission</div>
  if (!submissionQ.data) return <div className="p-8">Submission not found</div>

  const sub = submissionQ.data
  const isAuthor = sub.authorId === sub.author?.id
  const isDraft = sub.status === 'DRAFT'

  return (
    <div className="max-w-6xl mx-auto py-8 grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        <div className="bg-white rounded-lg p-6 shadow">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{sub.title}</h1>
              <p className="text-sm text-gray-600 mt-1">{sub.publication?.title ?? 'No publication'}</p>
            </div>
            <div className="text-right">
              <StatusBadge status={sub.status} />
              <p className="text-xs text-gray-500 mt-2">Submitted: {sub.submittedAt ? formatDate(sub.submittedAt) : '—'}</p>
            </div>
          </div>

          {isDraft && isAuthor && (
            <div className="mt-4 flex gap-2">
              <Button onClick={() => router.push(`/dashboard/submissions/${sub.id}/edit`)}>Edit manuscript</Button>
              <Button variant="secondary" onClick={handleSubmit} loading={submitMutation.isPending}>Submit</Button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Manuscript Versions</h2>

          {versionsQ.isLoading ? (
            <div>Loading versions...</div>
          ) : (
            <div className="space-y-3">
              {(versionsQ.data && versionsQ.data.length > 0) ? (
                versionsQ.data.map((ms: any) => (
                  <div key={ms.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="font-medium">v{ms.version} {ms.isLatest ? <span className="text-xs text-gray-500">(latest)</span> : null}</div>
                        <div className="text-sm text-gray-500">{ms.format}</div>
                      </div>
                      <div className="text-sm text-gray-500">Uploaded {ms.createdAt ? formatDate(ms.createdAt) : '—'}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => router.push(`/dashboard/submissions/${sub.id}/edit`)}>Open</Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm text-gray-600">No manuscript versions uploaded yet.</div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Peer Reviews</h2>

          {reviewsQ.isLoading ? (
            <div>Loading reviews...</div>
          ) : (reviewsQ.data && reviewsQ.data.length > 0) ? (
            <div className="space-y-4">
              {reviewsQ.data.map((r: any) => (
                <div key={r.id} className="p-4 border border-gray-100 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium">{r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : 'Anonymous'}</div>
                        <div className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${(RECOMMENDATION_LABELS[r.recommendation]?.color ?? 'gray')}-100 text-${(RECOMMENDATION_LABELS[r.recommendation]?.color ?? 'gray')}-700`}>{RECOMMENDATION_LABELS[r.recommendation]?.label ?? r.recommendation}</div>
                      </div>
                      <div className="text-xs text-gray-500">Submitted: {r.submittedAt ? formatDate(r.submittedAt) : '—'}</div>
                    </div>
                    <div className="text-sm text-gray-500">Status: {r.status}</div>
                  </div>

                  <div className="mt-3">
                    <div className="text-sm text-gray-700 mb-2"><strong>Comments for authors:</strong></div>
                    <div className="prose max-w-none text-sm text-gray-800">{r.comments || <em className="text-gray-500">No public comments</em>}</div>
                  </div>

                  {r.confidentialNotes && (
                    <div className="mt-3 bg-gray-50 border border-gray-100 p-3 rounded">
                      <div className="text-sm text-gray-600 font-medium">Confidential comments (editors only)</div>
                      <div className="text-sm text-gray-700 mt-2">{r.confidentialNotes}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-gray-600">No reviews available.</div>
          )}
        </div>

        {sub.status === 'REVISION_REQUIRED' && isAuthor && (
          <div className="bg-white rounded-lg p-6 shadow">
            <h3 className="text-lg font-semibold mb-4">Upload Revised Manuscript</h3>
            <FileUpload submissionId={sub.id} onUploadComplete={async () => { await handleUploadComplete() }} />
          </div>
        )}
      </div>

      <aside className="col-span-1 space-y-6">
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm text-gray-600 mb-2">Status</h3>
          <div className="flex items-center justify-between">
            <StatusBadge status={sub.status} />
            <div className="text-sm text-gray-500">{sub.reviews?.length ?? 0} reviews</div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow">
          {workflowQ.isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : workflowQ.data ? (
            <WorkflowTimeline steps={workflowQ.data} />
          ) : <div className="text-sm text-gray-500">No workflow history yet.</div>}
        </div>

        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm text-gray-600 mb-3">Decisions</h3>
          {sub.decisions && sub.decisions.length > 0 ? (
            <div className="space-y-3 text-sm">
              {sub.decisions.map((d: any) => (
                <div key={d.id} className="p-3 border border-gray-100 rounded">
                  <div className="text-sm font-medium">{d.decision}</div>
                  <div className="text-xs text-gray-500">By {d.editor?.firstName} {d.editor?.lastName} on {formatDate(d.createdAt)}</div>
                  {d.notes && <div className="mt-2 text-sm text-gray-700">{d.notes}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No decisions yet.</div>
          )}
        </div>
      </aside>
    </div>
  )
}
