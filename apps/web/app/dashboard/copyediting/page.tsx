'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/Form'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { toast } from 'sonner'
import { PenLine, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

type FilterKey = 'ALL' | 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REVISION_REQUESTED'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL',                label: 'All'               },
  { key: 'ASSIGNED',           label: 'Assigned'          },
  { key: 'IN_PROGRESS',        label: 'In Progress'       },
  { key: 'SUBMITTED',          label: 'Submitted'         },
  { key: 'REVISION_REQUESTED', label: 'Revision Needed'  },
  { key: 'APPROVED',           label: 'Approved'          },
]

export default function CopyEditingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [filter, setFilter] = React.useState<FilterKey>('ALL')
  const isEditor = user?.role === 'EDITOR_IN_CHIEF' || user?.role === 'SECTION_EDITOR'

  const { data, isLoading, refetch } = trpc.copyEdit.list.useQuery({ page: 1, limit: 50 })
  const startM = trpc.copyEdit.start.useMutation()

  const handleStart = async (id: string) => {
    try {
      await startM.mutateAsync({ id })
      toast.success('Copy edit started')
      refetch()
      router.push(`/dashboard/copyediting/${id}`)
    } catch { toast.error('Failed to start') }
  }

  const all: any[] = data?.copyEdits ?? []
  const filtered = all.filter((ce: any) => filter === 'ALL' || ce.status === filter)

  const counts = React.useMemo(() => {
    const m: Record<string, number> = {}
    all.forEach((ce: any) => { m[ce.status] = (m[ce.status] ?? 0) + 1 })
    return m
  }, [all])

  const statusIcon = (status: string) => {
    if (status === 'APPROVED')           return <CheckCircle size={14} className="text-green-500" aria-hidden="true" />
    if (status === 'IN_PROGRESS')        return <PenLine     size={14} className="text-blue-500"  aria-hidden="true" />
    if (status === 'REVISION_REQUESTED') return <RefreshCw   size={14} className="text-orange-500" aria-hidden="true" />
    return <Clock size={14} className="text-gray-400" aria-hidden="true" />
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Copy Editing</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isEditor ? 'All copy editing tasks in your journal' : 'Your copy editing assignments'}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(({ key, label }) => {
          const count = key === 'ALL' ? all.length : (counts[key] ?? 0)
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                filter === key
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              {label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${filter === key ? 'bg-white/20 text-white' : 'bg-gray-300 text-gray-700'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 py-16">
          <PenLine size={36} className="text-gray-300 mb-3" aria-hidden="true" />
          <p className="text-sm text-gray-500">No copy editing tasks in this category</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ce: any) => (
            <div key={ce.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start gap-4">
                <div className="mt-0.5">{statusIcon(ce.status)}</div>

                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => router.push(`/dashboard/copyediting/${ce.id}`)}
                    className="text-sm font-semibold text-brand-600 hover:underline text-left truncate block max-w-lg"
                  >
                    {ce.submission?.title ?? 'Unknown'}
                  </button>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {ce.submission?.publication?.title}
                    {isEditor && ce.editor && (
                      <span className="ml-3">
                        Assigned to: {ce.editor.firstName} {ce.editor.lastName}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={ce.status} />

                  {ce.status === 'ASSIGNED' && !isEditor && (
                    <Button size="sm" onClick={() => handleStart(ce.id)} loading={startM.isPending}>
                      <PenLine size={13} className="mr-1" /> Start
                    </Button>
                  )}

                  {(ce.status === 'IN_PROGRESS' || ce.status === 'REVISION_REQUESTED') && !isEditor && (
                    <Button size="sm" onClick={() => router.push(`/dashboard/copyediting/${ce.id}`)}>
                      <PenLine size={13} className="mr-1" /> Continue
                    </Button>
                  )}

                  {ce.status === 'SUBMITTED' && isEditor && (
                    <Button size="sm" onClick={() => router.push(`/dashboard/copyediting/${ce.id}`)}>
                      Review
                    </Button>
                  )}

                  {(ce.status === 'ASSIGNED' || ce.status === 'IN_PROGRESS' || ce.status === 'SUBMITTED') && (
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/dashboard/copyediting/${ce.id}`)}>
                      View
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
