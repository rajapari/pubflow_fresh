'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, CheckCircle, XCircle, Clock } from 'lucide-react'
import { trpc } from '@/components/providers'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'

const STATUS_FILTERS = ['All', 'OPEN', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'NEEDS_REVISION', 'REJECTED'] as const

const PROOF_STATUS_COLORS: Record<string, string> = {
  OPEN:          'bg-gray-100 text-gray-600',
  IN_PROGRESS:   'bg-blue-100 text-blue-700',
  SUBMITTED:     'bg-indigo-100 text-indigo-700',
  APPROVED:      'bg-green-100 text-green-700',
  REJECTED:      'bg-red-100 text-red-700',
  NEEDS_REVISION:'bg-amber-100 text-amber-700',
}

const PROOF_STATUS_ICONS: Record<string, React.ReactNode> = {
  APPROVED:       <CheckCircle size={12} className="text-green-600" />,
  REJECTED:       <XCircle size={12} className="text-red-600" />,
  NEEDS_REVISION: <Clock size={12} className="text-amber-600" />,
}

export default function ProofingPage() {
  const [statusFilter, setStatusFilter] = useState<string>('OPEN')
  const [page, setPage] = useState(1)

  const reviewsQ = trpc.proofReview.listAll.useQuery({
    status: statusFilter === 'All' ? undefined : statusFilter as any,
    page,
    limit: 20,
  })

  const pages = Math.ceil((reviewsQ.data?.total ?? 0) / 20)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Proofing</h1>
        <p className="mt-1 text-sm text-gray-500">Proof review sign-off across all submissions</p>
      </div>

      {/* Filters */}
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
          </button>
        ))}
      </div>

      {reviewsQ.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !reviewsQ.data?.reviews.length ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 py-16">
          <Eye size={40} className="text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No proof reviews in this stage</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['Submission', 'Reviewer', 'Round', 'Output', 'Status', 'Submitted', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(reviewsQ.data.reviews as any[]).map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <Link href={`/dashboard/submissions/${r.submission?.id}/proof-review`}
                        className="font-medium text-gray-900 hover:text-brand-600 truncate block">
                        {r.submission?.title}
                      </Link>
                      <StatusBadge status={r.submission?.status} className="mt-0.5" />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <div>{r.reviewer?.firstName} {r.reviewer?.lastName}</div>
                      <div className="text-gray-400">{r.reviewer?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">Round {r.round}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {r.output ? (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5">{r.output.format}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${PROOF_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {PROOF_STATUS_ICONS[r.status]}
                        {r.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {r.submittedAt ? formatDate(r.submittedAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/submissions/${r.submission?.id}/proof-review`}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </div>
  )
}
