'use client'

// Online proof workbench: authors and editors view the typeset PDF, answer
// production queries (Q1, Q2, …) and mark structured corrections that feed
// the correction-applier bot. Route: /dashboard/submissions/[id]/proof/[reviewId]
import React from 'react'
import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/Form'
import { toast } from 'sonner'
import {
  MessageCircleQuestion, ListChecks, Plus, Check, X, Trash2, Send, FileText,
} from 'lucide-react'

const KIND_LABELS: Record<string, string> = {
  INSERT: 'Insert text',
  DELETE: 'Delete text',
  REPLACE: 'Replace text',
  MOVE: 'Move content',
  QUERY_ANSWER: 'Query answer',
  COMMENT: 'Comment',
}

const CORRECTION_COLORS: Record<string, string> = {
  OPEN:     'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600',
  APPLIED:  'bg-blue-100 text-blue-700',
}

const QUERY_COLORS: Record<string, string> = {
  OPEN:     'bg-amber-100 text-amber-700',
  ANSWERED: 'bg-blue-100 text-blue-700',
  RESOLVED: 'bg-green-100 text-green-700',
}

export default function ProofWorkbenchPage() {
  const { reviewId } = useParams<{ id: string; reviewId: string }>()

  const wb = trpc.proofReview.workbench.useQuery(
    { proofReviewId: reviewId },
    { refetchInterval: 30_000 },
  )

  const addQueryM     = trpc.proofReview.addQuery.useMutation()
  const answerQueryM  = trpc.proofReview.answerQuery.useMutation()
  const resolveQueryM = trpc.proofReview.resolveQuery.useMutation()
  const addCorrM      = trpc.proofReview.addCorrection.useMutation()
  const setCorrM      = trpc.proofReview.setCorrectionStatus.useMutation()
  const delCorrM      = trpc.proofReview.deleteCorrection.useMutation()
  const submitM       = trpc.proofReview.submit.useMutation()

  const [tab, setTab] = React.useState<'queries' | 'corrections'>('corrections')

  // New-correction form state
  const [showCorrForm, setShowCorrForm] = React.useState(false)
  const [corrKind, setCorrKind]         = React.useState('REPLACE')
  const [corrPage, setCorrPage]         = React.useState('')
  const [corrTarget, setCorrTarget]     = React.useState('')
  const [corrNew, setCorrNew]           = React.useState('')
  const [corrNote, setCorrNote]         = React.useState('')

  // New-query form state (production roles only)
  const [showQueryForm, setShowQueryForm] = React.useState(false)
  const [queryText, setQueryText]         = React.useState('')
  const [queryPage, setQueryPage]         = React.useState('')

  // Per-query draft answers
  const [answers, setAnswers] = React.useState<Record<string, string>>({})

  if (wb.isLoading) return <div className="p-8 text-gray-500">Loading proof workbench…</div>
  if (wb.error) return <div className="p-8 text-red-600">Error: {wb.error.message}</div>
  const data = wb.data!
  const { review, pdfUrl, role } = data
  const queries = review.queries ?? []
  const corrections = review.corrections ?? []
  const readonly = review.status === 'SUBMITTED'

  const refresh = () => wb.refetch()

  const handleAddCorrection = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await addCorrM.mutateAsync({
        proofReviewId: reviewId,
        kind: corrKind as 'INSERT' | 'DELETE' | 'REPLACE' | 'MOVE' | 'QUERY_ANSWER' | 'COMMENT',
        page: corrPage ? Number(corrPage) : undefined,
        targetText: corrTarget.trim() || undefined,
        newText: corrNew.trim() || undefined,
        note: corrNote.trim() || undefined,
      })
      toast.success('Correction added')
      setShowCorrForm(false)
      setCorrTarget(''); setCorrNew(''); setCorrNote(''); setCorrPage('')
      refresh()
    } catch (err: any) { toast.error(err.message ?? 'Failed to add correction') }
  }

  const handleAddQuery = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await addQueryM.mutateAsync({
        proofReviewId: reviewId,
        question: queryText.trim(),
        page: queryPage ? Number(queryPage) : undefined,
      })
      toast.success('Query raised')
      setShowQueryForm(false)
      setQueryText(''); setQueryPage('')
      refresh()
    } catch (err: any) { toast.error(err.message ?? 'Failed to raise query') }
  }

  const handleAnswer = async (queryId: string) => {
    const answer = (answers[queryId] ?? '').trim()
    if (!answer) return
    try {
      await answerQueryM.mutateAsync({ queryId, answer })
      toast.success('Answer saved')
      setAnswers((a) => ({ ...a, [queryId]: '' }))
      refresh()
    } catch (err: any) { toast.error(err.message ?? 'Failed to answer') }
  }

  const openQueries = queries.filter((q: any) => q.status === 'OPEN').length
  const openCorrections = corrections.filter((c: any) => c.status === 'OPEN').length

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{review.submission.title}</h1>
          <p className="text-sm text-gray-500">
            Proof round {review.round} · {review.status} ·{' '}
            {openQueries} open {openQueries === 1 ? 'query' : 'queries'},{' '}
            {openCorrections} open {openCorrections === 1 ? 'correction' : 'corrections'}
          </p>
        </div>
        {(role.isReviewer && !readonly) && (
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                try {
                  await submitM.mutateAsync({ id: reviewId, status: 'APPROVED' })
                  toast.success('Proof approved'); refresh()
                } catch (err: any) { toast.error(err.message) }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="mr-1 h-4 w-4" /> Approve proof
            </Button>
            <Button
              onClick={async () => {
                try {
                  await submitM.mutateAsync({ id: reviewId, status: 'NEEDS_REVISION' })
                  toast.success('Revision requested'); refresh()
                } catch (err: any) { toast.error(err.message) }
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Send className="mr-1 h-4 w-4" /> Request corrections
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* PDF pane */}
        <div className="min-w-0 flex-1 bg-gray-100">
          {pdfUrl ? (
            <iframe src={pdfUrl} title="Typeset proof PDF" className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              <FileText className="mr-2 h-6 w-6" /> No typeset PDF linked to this proof yet
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="flex w-[400px] flex-col border-l bg-white">
          <div className="flex border-b">
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium ${tab === 'corrections' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-gray-500'}`}
              onClick={() => setTab('corrections')}
            >
              <ListChecks className="mr-1 inline h-4 w-4" /> Corrections ({corrections.length})
            </button>
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium ${tab === 'queries' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-gray-500'}`}
              onClick={() => setTab('queries')}
            >
              <MessageCircleQuestion className="mr-1 inline h-4 w-4" /> Queries ({queries.length})
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {tab === 'corrections' && (
              <>
                {!readonly && (
                  <Button variant="secondary" onClick={() => setShowCorrForm((v) => !v)} className="w-full">
                    <Plus className="mr-1 h-4 w-4" /> Mark a correction
                  </Button>
                )}

                {showCorrForm && (
                  <form onSubmit={handleAddCorrection} className="space-y-2 rounded-lg border p-3">
                    <div className="flex gap-2">
                      <select
                        value={corrKind}
                        onChange={(e) => setCorrKind(e.target.value)}
                        className="flex-1 rounded border px-2 py-1.5 text-sm"
                      >
                        {Object.entries(KIND_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <input
                        type="number" min={1} placeholder="Page"
                        value={corrPage} onChange={(e) => setCorrPage(e.target.value)}
                        className="w-20 rounded border px-2 py-1.5 text-sm"
                      />
                    </div>
                    {(corrKind === 'REPLACE' || corrKind === 'DELETE') && (
                      <textarea
                        placeholder="Exact text on the proof to change…"
                        value={corrTarget} onChange={(e) => setCorrTarget(e.target.value)}
                        className="w-full rounded border px-2 py-1.5 text-sm" rows={2} required
                      />
                    )}
                    {(corrKind === 'REPLACE' || corrKind === 'INSERT') && (
                      <textarea
                        placeholder="New / inserted text…"
                        value={corrNew} onChange={(e) => setCorrNew(e.target.value)}
                        className="w-full rounded border px-2 py-1.5 text-sm" rows={2} required
                      />
                    )}
                    <textarea
                      placeholder="Note for the typesetter (optional)…"
                      value={corrNote} onChange={(e) => setCorrNote(e.target.value)}
                      className="w-full rounded border px-2 py-1.5 text-sm" rows={1}
                    />
                    <Button type="submit" disabled={addCorrM.isPending} className="w-full">
                      Add correction
                    </Button>
                  </form>
                )}

                {corrections.length === 0 && (
                  <p className="py-6 text-center text-sm text-gray-400">No corrections marked yet.</p>
                )}
                {corrections.map((c: any) => (
                  <div key={c.id} className="rounded-lg border p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-gray-800">
                        {KIND_LABELS[c.kind] ?? c.kind}{c.page ? ` · p.${c.page}` : ''}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs ${CORRECTION_COLORS[c.status] ?? ''}`}>
                        {c.status}
                      </span>
                    </div>
                    {c.targetText && (
                      <p className="text-red-700 line-through">{c.targetText}</p>
                    )}
                    {c.newText && <p className="text-green-700">{c.newText}</p>}
                    {c.note && <p className="mt-1 text-gray-500">{c.note}</p>}
                    <div className="mt-2 flex gap-2">
                      {role.isEditor && c.status === 'OPEN' && (
                        <>
                          <button
                            onClick={async () => { await setCorrM.mutateAsync({ correctionId: c.id, status: 'ACCEPTED' }); refresh() }}
                            className="text-xs text-green-700 hover:underline"
                          >
                            <Check className="inline h-3 w-3" /> Accept
                          </button>
                          <button
                            onClick={async () => { await setCorrM.mutateAsync({ correctionId: c.id, status: 'REJECTED' }); refresh() }}
                            className="text-xs text-red-600 hover:underline"
                          >
                            <X className="inline h-3 w-3" /> Reject
                          </button>
                        </>
                      )}
                      {c.status === 'OPEN' && !readonly && (
                        <button
                          onClick={async () => {
                            try { await delCorrM.mutateAsync({ correctionId: c.id }); refresh() }
                            catch (err: any) { toast.error(err.message) }
                          }}
                          className="text-xs text-gray-400 hover:text-red-600 hover:underline"
                        >
                          <Trash2 className="inline h-3 w-3" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {tab === 'queries' && (
              <>
                {role.isEditor && !readonly && (
                  <Button variant="secondary" onClick={() => setShowQueryForm((v) => !v)} className="w-full">
                    <Plus className="mr-1 h-4 w-4" /> Raise a query
                  </Button>
                )}

                {showQueryForm && (
                  <form onSubmit={handleAddQuery} className="space-y-2 rounded-lg border p-3">
                    <textarea
                      placeholder="Question for the author…"
                      value={queryText} onChange={(e) => setQueryText(e.target.value)}
                      className="w-full rounded border px-2 py-1.5 text-sm" rows={2} required minLength={3}
                    />
                    <input
                      type="number" min={1} placeholder="Page (optional)"
                      value={queryPage} onChange={(e) => setQueryPage(e.target.value)}
                      className="w-full rounded border px-2 py-1.5 text-sm"
                    />
                    <Button type="submit" disabled={addQueryM.isPending} className="w-full">
                      Raise query
                    </Button>
                  </form>
                )}

                {queries.length === 0 && (
                  <p className="py-6 text-center text-sm text-gray-400">No queries on this proof.</p>
                )}
                {queries.map((q: any) => (
                  <div key={q.id} className="rounded-lg border p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-indigo-700">
                        {q.label}{q.page ? ` · p.${q.page}` : ''}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs ${QUERY_COLORS[q.status] ?? ''}`}>
                        {q.status}
                      </span>
                    </div>
                    <p className="text-gray-800">{q.question}</p>
                    {q.answer && (
                      <p className="mt-2 rounded bg-blue-50 p-2 text-blue-900">
                        <span className="font-medium">Answer:</span> {q.answer}
                      </p>
                    )}
                    {q.status === 'OPEN' && (role.isAuthor || role.isEditor) && !readonly && (
                      <div className="mt-2 flex gap-2">
                        <input
                          placeholder="Type your answer…"
                          value={answers[q.id] ?? ''}
                          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                          className="flex-1 rounded border px-2 py-1.5 text-sm"
                        />
                        <Button
                          onClick={() => handleAnswer(q.id)}
                          disabled={answerQueryM.isPending || !(answers[q.id] ?? '').trim()}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {q.status === 'ANSWERED' && role.isEditor && (
                      <button
                        onClick={async () => { await resolveQueryM.mutateAsync({ queryId: q.id }); refresh() }}
                        className="mt-2 text-xs text-green-700 hover:underline"
                      >
                        <Check className="inline h-3 w-3" /> Mark resolved
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
