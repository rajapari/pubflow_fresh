'use client'
import { FileText, Clock, CheckCircle, TrendingUp } from 'lucide-react'
import { trpc } from '@/components/providers'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'

export default function DashboardPage() {
  const { data, isLoading } = trpc.submission.list.useQuery({ page: 1, limit: 5 })

  const stats = [
    { label: 'Total Submissions', value: data?.total ?? '—', icon: FileText,      color: 'text-blue-600   bg-blue-50'   },
    { label: 'In Review',         value: '—',                icon: Clock,         color: 'text-yellow-600 bg-yellow-50' },
    { label: 'Accepted',          value: '—',                icon: CheckCircle,   color: 'text-green-600  bg-green-50'  },
    { label: 'Published',         value: '—',                icon: TrendingUp,    color: 'text-purple-600 bg-purple-50' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your publishing workflow</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className="mt-1.5 text-2xl font-semibold text-gray-900">{s.value}</p>
                </div>
                <div className={`rounded-lg p-2.5 ${s.color}`}><Icon size={20} /></div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent submissions */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="font-medium text-gray-900">Recent Submissions</h2>
          <a href="/dashboard/submissions" className="text-sm text-brand-600 hover:text-brand-700">View all →</a>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !data?.submissions.length ? (
          <div className="flex flex-col items-center py-12 text-center">
            <FileText size={32} className="mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">No submissions yet</p>
            <a href="/dashboard/submissions/new"
              className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
              New Submission
            </a>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.submissions.map((sub) => (
              <a key={sub.id} href={`/dashboard/submissions/${sub.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{sub.title}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {sub.publication.title} · {formatDate(sub.createdAt)}
                  </p>
                </div>
                <StatusBadge status={sub.status} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
