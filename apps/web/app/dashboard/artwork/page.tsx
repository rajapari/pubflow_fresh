'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Image, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/components/providers'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate, formatBytes } from '@/lib/utils'

const STATUS_FILTERS = ['All', 'PENDING', 'PROCESSING', 'APPROVED', 'NEEDS_REVISION', 'REJECTED'] as const
const TYPE_LABELS: Record<string, string> = {
  FIGURE: 'Figure', TABLE: 'Table', SUPPLEMENTARY: 'Supplementary', COVER: 'Cover',
}

export default function ArtworkPage() {
  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  const [page, setPage] = useState(1)
  const [rejectId, setRejectId]     = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const assetsQ  = trpc.asset.listAll.useQuery({
    status: statusFilter === 'All' ? undefined : statusFilter as any,
    page,
    limit: 20,
  })

  const approveM = trpc.asset.approve.useMutation()
  const rejectM  = trpc.asset.reject.useMutation()

  async function handleApprove(id: string) {
    try {
      await approveM.mutateAsync({ id })
      toast.success('Asset approved')
      assetsQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to approve')
    }
  }

  async function handleReject() {
    if (!rejectId || !rejectReason.trim()) return
    try {
      await rejectM.mutateAsync({ id: rejectId, reason: rejectReason })
      toast.success('Revision requested')
      setRejectId(null)
      setRejectReason('')
      assetsQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to reject')
    }
  }

  const pages = Math.ceil((assetsQ.data?.total ?? 0) / 20)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Artwork Review</h1>
        <p className="mt-1 text-sm text-gray-500">Review and approve figures, tables, and supplementary materials</p>
      </div>

      {/* Status filters */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => { setStatusFilter(f); setPage(1) }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === f
                ? 'bg-brand-500 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'All' ? 'All' : f.replace(/_/g, ' ')}
            {f !== 'All' && assetsQ.data && statusFilter !== f ? '' : ''}
          </button>
        ))}
      </div>

      {assetsQ.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !assetsQ.data?.assets.length ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 py-16">
          <Image size={40} className="text-gray-300 mb-3" aria-hidden="true" />
          <p className="text-sm text-gray-500">No assets found for this filter</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {(assetsQ.data.assets as any[]).map((asset: any) => (
              <div key={asset.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <Image size={20} className="text-gray-400" aria-hidden="true" />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">{asset.filename}</span>
                      <StatusBadge status={asset.status} />
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                        {TYPE_LABELS[asset.assetType] ?? asset.assetType}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-2">
                      {asset.dpi && <span>DPI: <strong>{asset.dpi}</strong></span>}
                      {asset.width && asset.height && <span>Size: <strong>{asset.width}×{asset.height}px</strong></span>}
                      {asset.colorMode && <span>Color: <strong>{asset.colorMode}</strong></span>}
                      <span>File: <strong>{formatBytes(asset.fileSizeBytes)}</strong></span>
                    </div>

                    {asset.figureLabel && <p className="text-xs text-gray-600"><strong>Label:</strong> {asset.figureLabel}</p>}
                    {asset.caption    && <p className="text-xs text-gray-600"><strong>Caption:</strong> {asset.caption}</p>}

                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      <span>Uploaded {formatDate(asset.uploadedAt)}</span>
                      <span>by {asset.uploadedBy?.firstName} {asset.uploadedBy?.lastName}</span>
                      <Link href={`/dashboard/submissions/${asset.submission?.id}`}
                        className="text-brand-600 hover:underline">
                        {asset.submission?.title ? `${asset.submission.title.slice(0, 40)}…` : 'View submission'}
                      </Link>
                    </div>
                  </div>

                  {/* Actions */}
                  {asset.status === 'PENDING' && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => handleApprove(asset.id)}
                        disabled={approveM.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
                      >
                        <CheckCircle size={13} /> Approve
                      </button>
                      <button
                        onClick={() => { setRejectId(asset.id); setRejectReason('') }}
                        className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        <AlertCircle size={13} /> Request revision
                      </button>
                    </div>
                  )}
                </div>

                {/* Rejection reason */}
                {asset.status === 'NEEDS_REVISION' && asset.metadata?.rejectionReason && (
                  <div className="mt-3 ml-14 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    <strong>Revision requested:</strong> {asset.metadata.rejectionReason}
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

      {/* Reject / Request Revision Modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Revision</h2>
            <p className="text-sm text-gray-600 mb-4">Describe what needs to be corrected:</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
              placeholder="e.g. DPI is 72, please resubmit at 300 DPI minimum…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || rejectM.isPending}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {rejectM.isPending ? 'Sending…' : 'Send Feedback'}
              </button>
              <button
                onClick={() => setRejectId(null)}
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
