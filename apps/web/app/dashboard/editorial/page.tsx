'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronRight, Users, ArrowRight, XCircle, CheckCircle, Clock } from 'lucide-react'
import { trpc } from '@/components/providers'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { hasMinRole, type UserRole } from '@pubflow/types'

const TABS = [
  { key: 'incoming',   label: 'Incoming',    statuses: ['SUBMITTED', 'DESK_REVIEW'] },
  { key: 'review',     label: 'Peer Review', statuses: ['PEER_REVIEW', 'REVISED'] },
  { key: 'production', label: 'Production',  statuses: ['ACCEPTED', 'COPY_EDITING', 'ARTWORK_PROCESSING', 'TYPESETTING', 'PROOF_REVIEW'] },
  { key: 'all',        label: 'All',         statuses: [] },
] as const

type TabKey = typeof TABS[number]['key']

interface AssignModal {
  submissionId: string
  submissionTitle: string
}

interface DecisionModal {
  submissionId: string
  submissionTitle: string
  currentStatus: string
}

export default function EditorialPage() {
  const { user } = useAuth()
  // submission.makeDecision is a chiefEditorProcedure (rank >= EDITOR_IN_CHIEF)
  // — SECTION_EDITOR has nav access to this page but would get a FORBIDDEN
  // from the backend, so hide the button rather than show-then-fail.
  const canDecide = !!user && hasMinRole(user.role as UserRole, 'EDITOR_IN_CHIEF')
  const [activeTab, setActiveTab]       = useState<TabKey>('incoming')
  const [page, setPage]                 = useState(1)
  const [assignModal, setAssignModal]   = useState<AssignModal | null>(null)
  const [decisionModal, setDecisionModal] = useState<DecisionModal | null>(null)

  const tab = TABS.find(t => t.key === activeTab)!
  // TABS use `as const` so statuses are narrow tuples; cast for runtime comparisons
  const statuses = tab.statuses as unknown as string[]
  const statusFilter = statuses.length === 1 ? (statuses[0] as any) : undefined

  const submissionsQ = trpc.submission.list.useQuery({
    status: statusFilter,
    page,
    limit: 20,
  })

  // Filter client-side for multi-status tabs
  const submissions = (submissionsQ.data?.submissions ?? []).filter((s: any) =>
    statuses.length === 0 || statuses.includes(s.status)
  )

  const reviewersQ = trpc.user.list.useQuery({ role: 'PEER_REVIEWER' }, { enabled: !!assignModal })

  const advanceMutation  = trpc.submission.advanceStatus.useMutation()
  const decisionMutation = trpc.submission.makeDecision.useMutation()
  const assignMutation   = trpc.review.assignReviewer.useMutation()

  const [dueDate, setDueDate]       = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [decision, setDecision]     = useState<'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | 'DESK_REJECT'>('ACCEPT')
  const [decisionNotes, setDecisionNotes] = useState('')

  async function handleAdvance(submissionId: string, toStatus: string) {
    try {
      await advanceMutation.mutateAsync({ submissionId, toStatus: toStatus as any })
      toast.success(`Moved to ${toStatus.replace(/_/g, ' ')}`)
      submissionsQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to advance status')
    }
  }

  async function handleAssign() {
    if (!assignModal || !reviewerId) return
    try {
      await assignMutation.mutateAsync({
        submissionId: assignModal.submissionId,
        reviewerId,
        dueAt: dueDate ? new Date(dueDate) : undefined,
      })
      toast.success('Reviewer assigned successfully')
      setAssignModal(null)
      setReviewerId('')
      setDueDate('')
      submissionsQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to assign reviewer')
    }
  }

  async function handleDecision() {
    if (!decisionModal) return
    try {
      await decisionMutation.mutateAsync({
        submissionId: decisionModal.submissionId,
        decision,
        notes: decisionNotes || undefined,
      })
      toast.success(`Decision recorded: ${decision.replace(/_/g, ' ')}`)
      setDecisionModal(null)
      setDecision('ACCEPT')
      setDecisionNotes('')
      submissionsQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to record decision')
    }
  }

  const NEXT_STATUS: Record<string, string> = {
    SUBMITTED:         'DESK_REVIEW',
    DESK_REVIEW:       'PEER_REVIEW',
    REVISED:           'PEER_REVIEW',
    ACCEPTED:          'COPY_EDITING',
    COPY_EDITING:      'ARTWORK_PROCESSING',
    ARTWORK_PROCESSING:'TYPESETTING',
    TYPESETTING:       'PROOF_REVIEW',
    PROOF_REVIEW:      'APPROVED',
    APPROVED:          'PUBLISHED',
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Editorial Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Manage the full submission workflow</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setPage(1) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Submission table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {submissionsQ.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-sm text-gray-500">
            No submissions in this stage
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['Title', 'Author', 'Journal', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.map((sub: any) => {
                  const nextStatus = NEXT_STATUS[sub.status]
                  return (
                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <Link href={`/dashboard/submissions/${sub.id}`} className="font-medium text-gray-900 hover:text-brand-600 truncate block">
                          {sub.title}
                        </Link>
                        <p className="text-xs text-gray-400">{sub._count?.reviews ?? 0} reviews</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {sub.author?.firstName} {sub.author?.lastName}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{sub.publication?.title}</td>
                      <td className="px-4 py-3"><StatusBadge status={sub.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(sub.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Advance to next stage */}
                          {nextStatus && !['PEER_REVIEW', 'APPROVED', 'PUBLISHED'].includes(sub.status) && (
                            <button
                              onClick={() => handleAdvance(sub.id, nextStatus)}
                              disabled={advanceMutation.isPending}
                              className="flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                            >
                              <ArrowRight size={12} />
                              {nextStatus.replace(/_/g, ' ')}
                            </button>
                          )}

                          {/* Assign reviewer (for DESK_REVIEW or PEER_REVIEW) */}
                          {['DESK_REVIEW', 'PEER_REVIEW', 'REVISED'].includes(sub.status) && (
                            <button
                              onClick={() => setAssignModal({ submissionId: sub.id, submissionTitle: sub.title })}
                              className="flex items-center gap-1 rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                            >
                              <Users size={12} />
                              Assign Reviewer
                            </button>
                          )}

                          {/* Editorial decision (for DESK_REVIEW or PEER_REVIEW stage) */}
                          {canDecide && ['SUBMITTED', 'DESK_REVIEW', 'PEER_REVIEW', 'REVISED'].includes(sub.status) && (
                            <button
                              onClick={() => setDecisionModal({ submissionId: sub.id, submissionTitle: sub.title, currentStatus: sub.status })}
                              className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                              <CheckCircle size={12} />
                              Decision
                            </button>
                          )}

                          <Link href={`/dashboard/submissions/${sub.id}`}
                            className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                            <ChevronRight size={12} />
                            Open
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {(submissionsQ.data?.total ?? 0) > 20 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500">Page {page} of {Math.ceil((submissionsQ.data?.total ?? 0) / 20)}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="rounded border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">Previous</button>
                  <button onClick={() => setPage(p => p + 1)}
                    disabled={page >= Math.ceil((submissionsQ.data?.total ?? 0) / 20)}
                    className="rounded border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Assign Reviewer Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Assign Reviewer</h2>
              <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600"><XCircle size={20} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-4 truncate">{assignModal.submissionTitle}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reviewer</label>
                {reviewersQ.isLoading ? (
                  <p className="text-sm text-gray-400">Loading reviewers...</p>
                ) : (
                  <select
                    value={reviewerId}
                    onChange={e => setReviewerId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Select a reviewer…</option>
                    {(reviewersQ.data ?? []).map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.firstName} {r.lastName} ({r.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due date (optional)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleAssign}
                disabled={!reviewerId || assignMutation.isPending}
                className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {assignMutation.isPending ? 'Assigning…' : 'Assign'}
              </button>
              <button
                onClick={() => setAssignModal(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editorial Decision Modal */}
      {decisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Editorial Decision</h2>
              <button onClick={() => setDecisionModal(null)} className="text-gray-400 hover:text-gray-600"><XCircle size={20} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-4 truncate">{decisionModal.submissionTitle}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Decision</label>
                <select
                  value={decision}
                  onChange={e => setDecision(e.target.value as any)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {decisionModal.currentStatus === 'SUBMITTED' || decisionModal.currentStatus === 'DESK_REVIEW'
                    ? <option value="DESK_REJECT">Desk Reject</option>
                    : null}
                  <option value="ACCEPT">Accept</option>
                  <option value="MINOR_REVISION">Minor Revision</option>
                  <option value="MAJOR_REVISION">Major Revision</option>
                  <option value="REJECT">Reject</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={decisionNotes}
                  onChange={e => setDecisionNotes(e.target.value)}
                  rows={4}
                  placeholder="Provide feedback to the author…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleDecision}
                disabled={decisionMutation.isPending}
                className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {decisionMutation.isPending ? 'Saving…' : 'Record Decision'}
              </button>
              <button
                onClick={() => setDecisionModal(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
