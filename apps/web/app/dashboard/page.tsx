'use client'
import Link from 'next/link'
import { FileText, Clock, CheckCircle, TrendingUp, BookOpen, Image, Type, Eye } from 'lucide-react'
import { trpc } from '@/components/providers'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'

export default function DashboardPage() {
  const statsQuery    = trpc.submission.stats.useQuery()
  const recentQuery   = trpc.submission.list.useQuery({ page: 1, limit: 5 })

  const sc = statsQuery.data?.statusCounts ?? {}
  const inReview = (sc['SUBMITTED'] ?? 0) + (sc['DESK_REVIEW'] ?? 0) + (sc['PEER_REVIEW'] ?? 0)
  const accepted = (sc['ACCEPTED'] ?? 0) + (sc['COPY_EDITING'] ?? 0) + (sc['ARTWORK_PROCESSING'] ?? 0) + (sc['TYPESETTING'] ?? 0) + (sc['PROOF_REVIEW'] ?? 0) + (sc['APPROVED'] ?? 0)
  const published = sc['PUBLISHED'] ?? 0

  const stats = [
    { label: 'Total Submissions', value: statsQuery.data?.total ?? '—',  icon: FileText,    color: 'text-blue-600   bg-blue-50'   },
    { label: 'In Review',         value: statsQuery.isLoading ? '—' : inReview, icon: Clock,       color: 'text-yellow-600 bg-yellow-50' },
    { label: 'In Production',     value: statsQuery.isLoading ? '—' : accepted, icon: CheckCircle, color: 'text-green-600  bg-green-50'  },
    { label: 'Published',         value: statsQuery.isLoading ? '—' : published, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
  ]

  const quickLinks = [
    { label: 'Editorial',   href: '/dashboard/editorial',   icon: BookOpen, desc: 'Manage incoming submissions and reviews' },
    { label: 'Artwork',     href: '/dashboard/artwork',     icon: Image,    desc: 'Review and approve figures & assets' },
    { label: 'Typesetting', href: '/dashboard/typesetting', icon: Type,     desc: 'Trigger PDF generation and monitor outputs' },
    { label: 'Proofing',    href: '/dashboard/proofing',    icon: Eye,      desc: 'Proof review sign-off workflow' },
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

      {/* Pipeline status breakdown */}
      {statsQuery.data && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Pipeline Breakdown</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(sc)
              .filter(([, count]) => count > 0)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([status, count]) => (
                <Link
                  key={status}
                  href={`/dashboard/submissions?status=${status}`}
                  className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs hover:bg-gray-50 transition-colors"
                >
                  <StatusBadge status={status} />
                  <span className="font-semibold text-gray-700">{count}</span>
                </Link>
              ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent submissions */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">Recent Submissions</h2>
            <Link href="/dashboard/submissions" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all →</Link>
          </div>
          {recentQuery.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : !recentQuery.data?.submissions.length ? (
            <div className="flex flex-col items-center py-10">
              <p className="text-sm text-gray-500">No submissions yet</p>
              <Link href="/dashboard/submissions/new" className="mt-2 text-sm text-brand-600 hover:underline">Create your first submission →</Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentQuery.data.submissions.map((sub: any) => (
                <li key={sub.id}>
                  <Link href={`/dashboard/submissions/${sub.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{sub.title}</p>
                      <p className="text-xs text-gray-400">{formatDate(sub.createdAt)}</p>
                    </div>
                    <StatusBadge status={sub.status} className="ml-3 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick links */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">Workflow Areas</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {quickLinks.map((ql) => {
              const Icon = ql.icon
              return (
                <li key={ql.href}>
                  <Link href={ql.href} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                      <Icon size={16} className="text-brand-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{ql.label}</p>
                      <p className="text-xs text-gray-500">{ql.desc}</p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
