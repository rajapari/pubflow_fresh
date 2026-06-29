'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Type, Play, Download, RefreshCw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/components/providers'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'

const STATUS_TABS = [
  { key: undefined,            label: 'All Production' },
  { key: 'TYPESETTING',        label: 'Typesetting' },
  { key: 'PROOF_REVIEW',       label: 'Proof Review' },
  { key: 'APPROVED',           label: 'Approved' },
] as const

const JOB_STATUS_COLORS: Record<string, string> = {
  QUEUED:     'bg-gray-100 text-gray-600',
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED:  'bg-green-100 text-green-700',
  FAILED:     'bg-red-100 text-red-700',
  RETRYING:   'bg-orange-100 text-orange-700',
}

interface TriggerModal {
  submissionId: string
  title: string
}

export default function TypesettingPage() {
  const [statusTab, setStatusTab] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [triggerModal, setTriggerModal] = useState<TriggerModal | null>(null)
  const [engine, setEngine] = useState<'LATEX' | 'PANDOC' | 'SCRIBUS'>('PANDOC')
  const [outputFormat, setOutputFormat] = useState<'PDF_PRINT' | 'PDF_WEB' | 'EPUB' | 'HTML' | 'JATS_XML'>('PDF_PRINT')

  const submissionsQ = trpc.typesetting.listSubmissions.useQuery({ status: statusTab as any, page, limit: 20 })
  const triggerM     = trpc.typesetting.triggerJob.useMutation()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const outputsQ = trpc.typesetting.listOutputs.useQuery(
    { submissionId: expandedId! },
    { enabled: !!expandedId }
  )

  async function handleTrigger() {
    if (!triggerModal) return
    try {
      await triggerM.mutateAsync({ submissionId: triggerModal.submissionId, engine, outputFormat })
      toast.success(`${engine} job queued for ${outputFormat}`)
      setTriggerModal(null)
      submissionsQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to queue job')
    }
  }

  const pages = Math.ceil((submissionsQ.data?.total ?? 0) / 20)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Typesetting</h1>
        <p className="mt-1 text-sm text-gray-500">Trigger PDF generation and monitor output status</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map(t => (
          <button
            key={String(t.key)}
            onClick={() => { setStatusTab(t.key); setPage(1) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusTab === t.key
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {submissionsQ.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !submissionsQ.data?.submissions.length ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 py-16">
          <Type size={40} className="text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No submissions in this stage</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {(submissionsQ.data.submissions as any[]).map((sub: any) => (
              <div key={sub.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link href={`/dashboard/submissions/${sub.id}`} className="font-medium text-gray-900 hover:text-brand-600 truncate">
                        {sub.title}
                      </Link>
                      <StatusBadge status={sub.status} />
                    </div>
                    <div className="flex gap-3 text-xs text-gray-400">
                      <span>{sub.publication?.title}</span>
                      <span>{sub.author?.firstName} {sub.author?.lastName}</span>
                      <span>{sub.outputs?.length ?? 0} outputs</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setTriggerModal({ submissionId: sub.id, title: sub.title })}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                    >
                      <Play size={12} /> Generate Output
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      {expandedId === sub.id ? 'Hide' : 'Show'} Outputs
                    </button>
                  </div>
                </div>

                {/* Outputs panel */}
                {expandedId === sub.id && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    {outputsQ.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <RefreshCw size={14} className="animate-spin" /> Loading outputs…
                      </div>
                    ) : !outputsQ.data?.length ? (
                      <p className="text-sm text-gray-400">No outputs generated yet. Click "Generate Output" to start.</p>
                    ) : (
                      <div className="space-y-2">
                        {(outputsQ.data as any[]).map((out: any) => (
                          <div key={out.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className={`rounded px-2 py-0.5 text-xs font-medium ${JOB_STATUS_COLORS[out.status]}`}>
                                {out.status}
                              </span>
                              <span className="text-sm text-gray-700">{out.format}</span>
                              <span className="text-xs text-gray-400">via {out.engine}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {out.generatedAt && (
                                <span className="text-xs text-gray-400">{formatDate(out.generatedAt)}</span>
                              )}
                              {out.status === 'COMPLETED' && out.minioKey && (
                                <button className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                                  <Download size={12} /> Download
                                </button>
                              )}
                              {out.status === 'FAILED' && out.errorMessage && (
                                <span className="text-xs text-red-500">{out.errorMessage.slice(0, 60)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Page {page} of {pages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">Previous</button>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                  className="rounded border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Trigger job modal */}
      {triggerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Generate Output</h2>
              <button onClick={() => setTriggerModal(null)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4 truncate">{triggerModal.title}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Layout Engine</label>
                <select value={engine} onChange={e => setEngine(e.target.value as any)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="PANDOC">Pandoc — Fast, supports most formats</option>
                  <option value="LATEX">LaTeX — High-quality PDF typesetting</option>
                  <option value="SCRIBUS">Scribus — Professional layout</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Output Format</label>
                <select value={outputFormat} onChange={e => setOutputFormat(e.target.value as any)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="PDF_PRINT">PDF (Print)</option>
                  <option value="PDF_WEB">PDF (Web)</option>
                  <option value="EPUB">EPUB</option>
                  <option value="HTML">HTML</option>
                  <option value="JATS_XML">JATS XML</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleTrigger}
                disabled={triggerM.isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                <Play size={14} />
                {triggerM.isPending ? 'Queuing…' : 'Queue Job'}
              </button>
              <button onClick={() => setTriggerModal(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
