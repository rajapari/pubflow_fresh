'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/Form'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import {
  CheckCircle, XCircle, RefreshCw, Download, UserPlus, Eye,
} from 'lucide-react'

const EDITOR_ROLES = ['EDITOR_IN_CHIEF', 'SECTION_EDITOR', 'SUPER_ADMIN']

const STATUS_COLORS: Record<string, string> = {
  OPEN:           'bg-gray-100 text-gray-600',
  IN_PROGRESS:    'bg-blue-100 text-blue-700',
  SUBMITTED:      'bg-indigo-100 text-indigo-700',
  APPROVED:       'bg-green-100 text-green-700',
  REJECTED:       'bg-red-100 text-red-700',
  NEEDS_REVISION: 'bg-amber-100 text-amber-700',
}

export default function ProofReviewPage() {
  const { id: submissionId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const isEditor = EDITOR_ROLES.includes(user?.role ?? '')

  const reviewsQ  = trpc.proofReview.listForSubmission.useQuery({ submissionId })
  const outputsQ  = trpc.proofReview.listOutputs.useQuery({ submissionId })
  const editorsQ  = trpc.user.list.useQuery(
    { role: 'SECTION_EDITOR' },
    { enabled: isEditor }
  )
  const proofReadersQ = trpc.user.list.useQuery(
    { role: 'PROOF_READER' },
    { enabled: isEditor }
  )

  const assignM   = trpc.proofReview.assign.useMutation()
  const submitM   = trpc.proofReview.submit.useMutation()

  const [selectedId, setSelectedId]         = React.useState<string | null>(null)
  const [comments, setComments]             = React.useState('')
  const [showAssign, setShowAssign]         = React.useState(false)
  const [assignEditorId, setAssignEditorId] = React.useState('')
  const [assignRound, setAssignRound]       = React.useState(1)

  const selected = (reviewsQ.data as any[] | undefined)?.find((r: any) => r.id === selectedId)

  // Download URL is fetched lazily when user clicks
  const [downloadOutputId, setDownloadOutputId] = React.useState<string | null>(null)
  const downloadQ = trpc.proofReview.getDownloadUrl.useQuery(
    { outputId: downloadOutputId! },
    { enabled: !!downloadOutputId }
  )
  React.useEffect(() => {
    if (downloadQ.data?.url) {
      window.open(downloadQ.data.url, '_blank')
      setDownloadOutputId(null)
    }
  }, [downloadQ.data])

  const handleSubmitReview = async (status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION') => {
    if (!selectedId) return
    try {
      await submitM.mutateAsync({ id: selectedId, status, comments: comments.trim() || undefined })
      toast.success('Review submitted')
      setComments('')
      setSelectedId(null)
      reviewsQ.refetch()
    } catch (err: any) { toast.error(err.message ?? 'Failed to submit review') }
  }

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignEditorId) return
    try {
      await assignM.mutateAsync({ submissionId, reviewerId: assignEditorId, round: assignRound })
      toast.success('Proof reviewer assigned')
      setShowAssign(false)
      setAssignEditorId('')
      reviewsQ.refetch()
    } catch (err: any) { toast.error(err.message ?? 'Failed to assign reviewer') }
  }

  const allAssignees = [
    ...(editorsQ.data ?? []),
    ...(proofReadersQ.data ?? []),
  ]

  const reviews = (reviewsQ.data as any[]) ?? []
  const outputs = (outputsQ.data as any[]) ?? []

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Proof Review</h1>
          <p className="mt-1 text-sm text-gray-500">Review typeset output and approve for publication</p>
        </div>
        {isEditor && (
          <Button onClick={() => setShowAssign(v => !v)}>
            <UserPlus size={14} className="mr-1.5" />
            {showAssign ? 'Cancel' : 'Assign Reviewer'}
          </Button>
        )}
      </div>

      {/* Assign panel — editor only */}
      {isEditor && showAssign && (
        <form onSubmit={handleAssign} className="rounded-xl border border-brand-200 bg-brand-50 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-brand-800">Assign Proof Reviewer</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reviewer</label>
              <select
                required
                value={assignEditorId}
                onChange={e => setAssignEditorId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select a reviewer…</option>
                {allAssignees.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.role.replace(/_/g, ' ')})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Round</label>
              <input
                type="number"
                min="1"
                value={assignRound}
                onChange={e => setAssignRound(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <Button type="submit" loading={assignM.isPending}>Assign</Button>
        </form>
      )}

      {/* Typeset outputs — download panel */}
      {isEditor && outputs.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Typeset Outputs</h2>
          <div className="space-y-2">
            {outputs.map((out: any) => (
              <div key={out.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5">
                <div className="text-sm">
                  <span className="font-medium">{out.format}</span>
                  <span className="ml-2 text-xs text-gray-400">v{out.version} · {out.status}</span>
                </div>
                {out.status === 'COMPLETED' && (
                  <button
                    onClick={() => setDownloadOutputId(out.id)}
                    disabled={downloadQ.isLoading && downloadOutputId === out.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <Download size={12} />
                    {downloadQ.isLoading && downloadOutputId === out.id ? 'Preparing…' : 'Download'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Reviews list */}
        <div className="md:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Reviews</h2>

          {reviewsQ.isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center">
              <Eye size={28} className="text-gray-300 mx-auto mb-2" aria-hidden="true" />
              <p className="text-xs text-gray-400">No proof reviews assigned</p>
            </div>
          ) : (
            reviews.map((r: any) => (
              <button
                key={r.id}
                onClick={() => { setSelectedId(r.id); setComments('') }}
                className={[
                  'w-full rounded-xl border-2 p-4 text-left transition-colors',
                  selectedId === r.id
                    ? 'border-brand-400 bg-brand-50'
                    : 'border-gray-200 bg-white hover:border-gray-300',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {r.reviewer?.firstName} {r.reviewer?.lastName}
                  </p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {r.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-400">Round {r.round}</p>
                {r.submittedAt && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Submitted {new Date(r.submittedAt).toLocaleDateString()}
                  </p>
                )}
                {/* span, not <a>: anchors can't nest inside the row button */}
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    window.location.href = `/dashboard/submissions/${submissionId}/proof/${r.id}`
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation()
                      window.location.href = `/dashboard/submissions/${submissionId}/proof/${r.id}`
                    }
                  }}
                  className="mt-1.5 inline-block text-xs font-medium text-brand-600 hover:underline"
                >
                  Open proof workbench →
                </span>
              </button>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="md:col-span-2">
          {!selected ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-24">
              <p className="text-sm text-gray-400">Select a review to see details</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Reviewer info */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{selected.reviewer?.firstName} {selected.reviewer?.lastName}</p>
                    <p className="text-xs text-gray-400">{selected.reviewer?.email}</p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Round</p>
                    <p className="font-medium">{selected.round}</p>
                  </div>
                  {selected.submittedAt && (
                    <div>
                      <p className="text-xs text-gray-400">Submitted</p>
                      <p className="font-medium">{new Date(selected.submittedAt).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Output download */}
              {selected.output && (
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Output for Review</h3>
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
                    <div className="text-sm">
                      <p className="font-medium">{selected.output.format}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {selected.output.status}
                        {selected.output.generatedAt && ` · ${new Date(selected.output.generatedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    {selected.output.status === 'COMPLETED' && (
                      <button
                        onClick={() => setDownloadOutputId(selected.output.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <Download size={12} /> Download
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Submitted comments */}
              {selected.status === 'SUBMITTED' && selected.comments && (
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">Reviewer Comments</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.comments}</p>
                </div>
              )}

              {/* Submit form — for assigned reviewer only, when OPEN or IN_PROGRESS */}
              {(selected.status === 'OPEN' || selected.status === 'IN_PROGRESS') &&
                (user?.id === selected.reviewerId || isEditor) && (
                <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800">Submit Your Review</h3>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Comments (optional)
                    </label>
                    <textarea
                      value={comments}
                      onChange={e => setComments(e.target.value)}
                      rows={4}
                      placeholder="Describe any issues found in the typeset proof…"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1 justify-center"
                      onClick={() => handleSubmitReview('APPROVED')}
                      loading={submitM.isPending}
                    >
                      <CheckCircle size={14} className="mr-1.5" /> Approve
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1 justify-center"
                      onClick={() => handleSubmitReview('NEEDS_REVISION')}
                      loading={submitM.isPending}
                    >
                      <RefreshCw size={14} className="mr-1.5" /> Needs Revision
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1 justify-center text-red-600"
                      onClick={() => handleSubmitReview('REJECTED')}
                      loading={submitM.isPending}
                    >
                      <XCircle size={14} className="mr-1.5" /> Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* Already submitted state */}
              {selected.status !== 'OPEN' && selected.status !== 'IN_PROGRESS' && !selected.comments && (
                <div className={[
                  'flex items-center gap-2 rounded-xl border p-4 text-sm font-medium',
                  selected.status === 'APPROVED'
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : selected.status === 'REJECTED'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700',
                ].join(' ')}>
                  {selected.status === 'APPROVED'
                    ? <><CheckCircle size={16} /> Approved</>
                    : selected.status === 'REJECTED'
                    ? <><XCircle size={16} /> Rejected</>
                    : <><RefreshCw size={16} /> Needs revision</>
                  }
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
