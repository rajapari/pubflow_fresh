'use client'
import { FileText, Clock, CheckCircle, TrendingUp } from 'lucide-react'
import { trpc } from '@/components/providers'

export default function DashboardPage() {
  const submissionsQuery = trpc.submission.list.useQuery({ page: 1, limit: 5 })

  const stats = [
    { label: 'Total Submissions', value: submissionsQuery.data?.total ?? '—', icon: FileText,      color: 'text-blue-600   bg-blue-50'   },
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

      {/* Placeholder for recent submissions */}
      <div className="rounded-xl border border-gray-200 bg-white p-8">
        <h2 className="font-medium text-gray-900 mb-4">Recent Submissions</h2>
        <p className="text-gray-500 text-sm">
          <a href="/dashboard/submissions" className="text-blue-600 hover:text-blue-700">View submissions dashboard →</a>
        </p>
      </div>
    </div>
  )
}
