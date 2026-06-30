'use client'

import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, BookMarked, ChevronDown, ChevronUp,
  Send, UserCheck, XCircle, Globe, AlertCircle, FileText, Settings,
} from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Form'

const CURRENT_YEAR = new Date().getFullYear()

function IssueLabel(issue: { volume?: number | null; number?: number | null; year: number; title?: string | null }) {
  const parts = []
  if (issue.volume) parts.push(`Vol. ${issue.volume}`)
  if (issue.number) parts.push(`No. ${issue.number}`)
  parts.push(String(issue.year))
  const base = parts.join(', ')
  return issue.title ? `${base} — ${issue.title}` : base
}

type Tab = 'issues' | 'guidelines'

export default function PublicationDetailPage() {
  const { id: publicationId } = useParams<{ id: string }>()
  const router = useRouter()

  const pubQ    = trpc.publication.byId.useQuery({ id: publicationId })
  const issuesQ = trpc.issue.list.useQuery({ publicationId })

  const createM   = trpc.issue.create.useMutation()
  const publishM  = trpc.issue.publish.useMutation()
  const assignM   = trpc.issue.assignSubmission.useMutation()
  const removeM   = trpc.issue.removeSubmission.useMutation()
  const updateM   = trpc.publication.update.useMutation()

  const [activeTab, setActiveTab]           = React.useState<Tab>('issues')
  const [showCreate, setShowCreate]         = React.useState(false)
  const [expandedIssue, setExpandedIssue]  = React.useState<string | null>(null)
  const [assignTarget, setAssignTarget]    = React.useState<string | null>(null)

  const [form, setForm] = React.useState({
    volume: '', number: '', year: String(CURRENT_YEAR), title: '',
  })

  // Guidelines edit state — seeded from DB when pub loads
  const pub    = pubQ.data as any
  const issues = issuesQ.data ?? []

  const [guidelines, setGuidelines] = React.useState('')
  const [reviewerInstr, setReviewerInstr] = React.useState('')
  const [guidelinesLoaded, setGuidelinesLoaded] = React.useState(false)

  React.useEffect(() => {
    if (pub && !guidelinesLoaded) {
      setGuidelines(pub.submissionGuidelines ?? '')
      setReviewerInstr(pub.reviewerInstructions ?? '')
      setGuidelinesLoaded(true)
    }
  }, [pub, guidelinesLoaded])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createM.mutateAsync({
        publicationId,
        volume: form.volume ? Number(form.volume) : undefined,
        number: form.number ? Number(form.number) : undefined,
        year:   Number(form.year),
        title:  form.title || undefined,
      })
      toast.success('Issue created')
      setShowCreate(false)
      setForm({ volume: '', number: '', year: String(CURRENT_YEAR), title: '' })
      issuesQ.refetch()
    } catch (err: any) { toast.error(err.message ?? 'Failed to create issue') }
  }

  const handlePublish = async (issueId: string) => {
    if (!confirm('Publish this issue? All APPROVED submissions will be marked PUBLISHED and authors notified.')) return
    try {
      const res = await publishM.mutateAsync({ id: issueId })
      toast.success(`Issue published — ${res.published} article${res.published !== 1 ? 's' : ''} published`)
      issuesQ.refetch()
    } catch (err: any) { toast.error(err.message ?? 'Failed to publish issue') }
  }

  const handleAssign = async (submissionId: string) => {
    if (!assignTarget) return
    try {
      await assignM.mutateAsync({ issueId: assignTarget, submissionId })
      toast.success('Submission added to issue')
      issuesQ.refetch()
      candidatesQ.refetch()
    } catch (err: any) { toast.error(err.message ?? 'Failed to assign submission') }
  }

  const handleRemove = async (issueId: string, submissionId: string) => {
    try {
      await removeM.mutateAsync({ issueId, submissionId })
      toast.success('Submission removed from issue')
      issuesQ.refetch()
    } catch (err: any) { toast.error(err.message ?? 'Failed to remove') }
  }

  const handleSaveGuidelines = async () => {
    try {
      await updateM.mutateAsync({
        id: publicationId,
        submissionGuidelines: guidelines || undefined,
        reviewerInstructions: reviewerInstr || undefined,
      })
      toast.success('Guidelines saved')
      pubQ.refetch()
    } catch (err: any) { toast.error(err.message ?? 'Failed to save') }
  }

  // Per-issue candidate query — only fetches when assigning
  const candidatesQ = trpc.issue.candidates.useQuery(
    { issueId: assignTarget ?? '', publicationId },
    { enabled: !!assignTarget }
  )

  if (pubQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    )
  }
  if (!pub) return <p className="text-gray-500 py-8">Publication not found.</p>

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => router.push('/dashboard/publications')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft size={14} /> Publications
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{pub.title}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{pub.type}</span>
              {pub.issn && <span>ISSN: {pub.issn}</span>}
              {pub.isbn && <span>ISBN: {pub.isbn}</span>}
            </div>
          </div>
          {activeTab === 'issues' && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} className="mr-1.5" /> New Issue
            </Button>
          )}
          {activeTab === 'guidelines' && (
            <Button onClick={handleSaveGuidelines} loading={updateM.isPending}>
              Save Guidelines
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'issues',     label: 'Issues & Volumes', icon: BookMarked },
          { key: 'guidelines', label: 'Author Guidelines', icon: FileText },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === key
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Issues tab ── */}
      {activeTab === 'issues' && (
        <>
          {issuesQ.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 py-16">
              <BookMarked size={36} className="text-gray-300 mb-3" aria-hidden="true" />
              <p className="text-sm text-gray-500 mb-2">No issues yet</p>
              <button onClick={() => setShowCreate(true)} className="text-sm text-brand-600 hover:underline">
                Create the first issue →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((issue: any) => {
                const isExpanded   = expandedIssue === issue.id
                const isAssigning  = assignTarget === issue.id
                const isPublished  = !!issue.publishedAt
                const label        = IssueLabel(issue)

                return (
                  <div key={issue.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{label}</span>
                          {isPublished && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                              <Globe size={10} /> Published
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {issue._count.submissions} article{issue._count.submissions !== 1 ? 's' : ''}
                          {isPublished && ` · Published ${new Date(issue.publishedAt).toLocaleDateString()}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isPublished && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setAssignTarget(isAssigning ? null : issue.id)}>
                              <UserCheck size={13} className="mr-1" />
                              {isAssigning ? 'Done' : 'Assign'}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handlePublish(issue.id)}
                              loading={publishM.isPending}
                              disabled={issue._count.submissions === 0}
                            >
                              <Send size={13} className="mr-1" /> Publish
                            </Button>
                          </>
                        )}
                        <button
                          onClick={() => setExpandedIssue(isExpanded ? null : issue.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>

                    {isAssigning && (
                      <div className="border-t border-gray-100 bg-blue-50 px-5 py-4">
                        <p className="text-xs font-semibold text-blue-700 mb-3">Add articles to this issue</p>
                        {candidatesQ.isLoading ? (
                          <p className="text-xs text-gray-500">Loading candidates…</p>
                        ) : !candidatesQ.data?.length ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <AlertCircle size={13} />
                            No APPROVED submissions available to assign
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {candidatesQ.data.map((sub: any) => {
                              const alreadyInIssue = issue.submissions?.some((s: any) => s.id === sub.id)
                              return (
                                <div key={sub.id} className="flex items-center justify-between rounded-lg border border-blue-100 bg-white px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-gray-800">{sub.title}</p>
                                    <p className="text-xs text-gray-500">
                                      {sub.author.firstName} {sub.author.lastName} · <StatusBadge status={sub.status} />
                                    </p>
                                  </div>
                                  {alreadyInIssue ? (
                                    <button
                                      onClick={() => handleRemove(issue.id, sub.id)}
                                      disabled={removeM.isPending}
                                      className="shrink-0 ml-3 text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                                    >
                                      <XCircle size={12} /> Remove
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleAssign(sub.id)}
                                      disabled={assignM.isPending}
                                      className="shrink-0 ml-3 text-xs font-medium text-brand-600 hover:text-brand-800"
                                    >
                                      + Add
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {isExpanded && issue.submissions?.length > 0 && (
                      <div className="border-t border-gray-100">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Article</th>
                              <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Author</th>
                              <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                              {!isPublished && <th className="px-5 py-2.5" />}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {issue.submissions.map((sub: any) => (
                              <tr key={sub.id} className="hover:bg-gray-50">
                                <td className="px-5 py-3">
                                  <button
                                    onClick={() => router.push(`/dashboard/submissions/${sub.id}`)}
                                    className="text-brand-600 hover:underline font-medium text-left line-clamp-1"
                                  >
                                    {sub.title}
                                  </button>
                                </td>
                                <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                                  {sub.author?.firstName} {sub.author?.lastName}
                                </td>
                                <td className="px-5 py-3 whitespace-nowrap">
                                  <StatusBadge status={sub.status} />
                                </td>
                                {!isPublished && (
                                  <td className="px-5 py-3 text-right">
                                    <button
                                      onClick={() => handleRemove(issue.id, sub.id)}
                                      disabled={removeM.isPending}
                                      className="text-xs text-gray-400 hover:text-red-500"
                                    >
                                      Remove
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {isExpanded && issue.submissions?.length === 0 && (
                      <div className="border-t border-gray-100 px-5 py-4 text-center text-sm text-gray-400">
                        No articles assigned yet
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Guidelines tab ── */}
      {activeTab === 'guidelines' && (
        <div className="space-y-6">
          {/* Submission guidelines banner preview */}
          {(pub.submissionGuidelines || pub.reviewerInstructions) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <Settings size={14} className="inline mr-1.5 text-amber-600" />
              These guidelines are shown to authors when they select this journal in the submission form.
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {/* Submission guidelines */}
            <div className="p-5 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Submission Guidelines for Authors</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Displayed on the submission form when an author selects this journal. Use plain text with line breaks.
                </p>
              </div>
              <textarea
                value={guidelines}
                onChange={e => setGuidelines(e.target.value)}
                rows={14}
                placeholder={`Example:
- Manuscripts must be in English and formatted in DOCX.
- Maximum length: 8,000 words (excluding references).
- All authors must have an ORCID.
- Conflict of interest declaration is required.
- References must follow APA 7th edition.
- Figures and tables must be cited in the text.`}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
              <p className="text-xs text-gray-400 text-right">{guidelines.length} / 20,000 characters</p>
            </div>

            {/* Reviewer instructions */}
            <div className="p-5 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Reviewer Instructions</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Shown to peer reviewers when they open the review form for this journal.
                </p>
              </div>
              <textarea
                value={reviewerInstr}
                onChange={e => setReviewerInstr(e.target.value)}
                rows={10}
                placeholder={`Example:
- Evaluate originality, methodological rigour, and clarity of contribution.
- Provide a structured report with: Summary, Major Concerns, Minor Concerns, and Recommendation.
- Reviews should be completed within 21 days of acceptance.
- Reviewer anonymity is double-blind.`}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
              <p className="text-xs text-gray-400 text-right">{reviewerInstr.length} / 20,000 characters</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveGuidelines} loading={updateM.isPending}>
              Save Guidelines
            </Button>
          </div>
        </div>
      )}

      {/* Create issue modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">New Issue</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Volume</label>
                  <input
                    type="number" min="1" value={form.volume}
                    onChange={e => setForm(f => ({ ...f, volume: e.target.value }))}
                    placeholder="e.g. 5"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Number</label>
                  <input
                    type="number" min="1" value={form.number}
                    onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
                    placeholder="e.g. 2"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Year *</label>
                  <input
                    required type="number" min="1900" max="2100" value={form.year}
                    onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Issue title (optional)</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Special Issue on Climate Change"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={createM.isPending} className="flex-1 justify-center">
                  Create Issue
                </Button>
                <button
                  type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
