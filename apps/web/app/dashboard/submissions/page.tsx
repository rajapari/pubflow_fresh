'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { trpc } from '@/components/providers'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'
import { SubmissionStatusSchema, type SubmissionStatus } from '@pubflow/types'

const FILTERS = ['All','DRAFT','SUBMITTED','PEER_REVIEW','ACCEPTED','TYPESETTING','PUBLISHED','REJECTED']

export default function SubmissionsPage() {
  const searchParams = useSearchParams()
  // The dashboard's pipeline breakdown links here with any status in the
  // full enum (e.g. DESK_REVIEW, PROOF_REVIEW), not just the pill shortcuts
  // below — validate against the full schema, not the narrower FILTERS list.
  const initialStatusParse = SubmissionStatusSchema.safeParse(searchParams.get('status'))
  const [status, setStatus] = useState<SubmissionStatus | undefined>(
    initialStatusParse.success ? initialStatusParse.data : undefined,
  )
  const [page, setPage]     = useState(1)

  const { data, isLoading } = trpc.submission.list.useQuery({
    status, page, limit: 20,
  })

  const pages = data ? Math.ceil(data.total / 20) : 1

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Submissions</h1>
          <p className="mt-1 text-sm text-gray-500">{data?.total ?? 0} total</p>
        </div>
        <a href="/dashboard/submissions/new"
          className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
          <Plus size={16} /> New Submission
        </a>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f}
            onClick={() => { setStatus(f === 'All' ? undefined : (f as any)); setPage(1) }}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              (f === 'All' && !status) || f === status
                ? 'bg-brand-500 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}>
            {f === 'All' ? 'All' : f.replace(/_/g,' ')}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !data?.submissions.length ? (
          <div className="flex flex-col items-center py-16">
            <p className="text-sm text-gray-500">No submissions found</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['Title','Journal','Author','Status','Date'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.submissions || []).map((sub: any) => (
                  <tr key={sub.id} className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => window.location.href = `/dashboard/submissions/${sub.id}`}>
                    <td className="px-5 py-3.5 font-medium text-gray-900 max-w-xs">
                      <p className="truncate">{sub.title}</p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{sub.publication?.title}</td>
                    <td className="px-5 py-3.5 text-gray-500">{sub.author?.firstName} {sub.author?.lastName}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={sub.status} /></td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">{formatDate(sub.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
                <p className="text-xs text-gray-500">Page {page} of {pages}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">Previous</button>
                  <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
