'use client'

import React from 'react'
import { trpc } from '@/lib/trpc-client'
import {
  FileText, TrendingUp, CheckCircle, BarChart2,
  BookOpen, BookMarked, Clock, Users,
} from 'lucide-react'

// ── Tiny SVG bar chart ────────────────────────────────────────
function BarChart({ data }: { data: { label: string; count: number; published: number }[] }) {
  const maxVal = Math.max(...data.map(d => d.count), 1)
  const W = 480
  const H = 80
  const barW = Math.floor(W / data.length) - 2

  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" aria-label="Submission trend chart">
      {data.map((d, i) => {
        const x = i * (W / data.length) + 1
        const barH = Math.round((d.count / maxVal) * H)
        const pubH = Math.round((d.published / maxVal) * H)
        return (
          <g key={d.label}>
            {/* Base bar */}
            <rect
              x={x} y={H - barH} width={barW} height={barH}
              rx="2" className="fill-brand-200"
            />
            {/* Published overlay */}
            {pubH > 0 && (
              <rect
                x={x} y={H - pubH} width={barW} height={pubH}
                rx="2" className="fill-brand-500"
              />
            )}
            {/* Month label */}
            <text
              x={x + barW / 2} y={H + 12}
              textAnchor="middle"
              fontSize="7"
              className="fill-gray-400"
            >
              {d.label}
            </text>
            {/* Count tooltip on bar */}
            {d.count > 0 && (
              <text
                x={x + barW / 2} y={H - barH - 2}
                textAnchor="middle"
                fontSize="6"
                className="fill-gray-500"
              >
                {d.count}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Horizontal pipeline bar ───────────────────────────────────
const STATUS_ORDER = [
  'DRAFT','SUBMITTED','DESK_REVIEW','PEER_REVIEW','REVISION_REQUIRED',
  'REVISED','ACCEPTED','COPY_EDITING','ARTWORK_PROCESSING',
  'TYPESETTING','PROOF_REVIEW','APPROVED','PUBLISHED','REJECTED','WITHDRAWN',
]

const STATUS_COLOR: Record<string, string> = {
  DRAFT:              'bg-gray-300',
  SUBMITTED:          'bg-blue-400',
  DESK_REVIEW:        'bg-blue-500',
  PEER_REVIEW:        'bg-indigo-500',
  REVISION_REQUIRED:  'bg-amber-400',
  REVISED:            'bg-amber-500',
  ACCEPTED:           'bg-green-400',
  COPY_EDITING:       'bg-teal-400',
  ARTWORK_PROCESSING: 'bg-teal-500',
  TYPESETTING:        'bg-cyan-500',
  PROOF_REVIEW:       'bg-violet-500',
  APPROVED:           'bg-green-500',
  PUBLISHED:          'bg-green-600',
  REJECTED:           'bg-red-400',
  WITHDRAWN:          'bg-gray-400',
}

function PipelineBar({ statusCounts }: { statusCounts: Record<string, number> }) {
  const entries = STATUS_ORDER
    .filter(s => (statusCounts[s] ?? 0) > 0)
    .map(s => ({ status: s, count: statusCounts[s] }))
  const max = Math.max(...entries.map(e => e.count), 1)

  return (
    <div className="space-y-2">
      {entries.map(({ status, count }) => (
        <div key={status} className="flex items-center gap-3">
          <div className="w-32 shrink-0 text-xs text-gray-600 truncate" title={status}>
            {status.replace(/_/g, ' ')}
          </div>
          <div className="flex-1 h-2 rounded-full bg-gray-100">
            <div
              className={`h-2 rounded-full transition-all ${STATUS_COLOR[status] ?? 'bg-brand-400'}`}
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <div className="w-6 text-right text-xs font-medium text-gray-700">{count}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function AnalyticsPage() {
  const overviewQ    = trpc.analytics.overview.useQuery()
  const trendQ       = trpc.analytics.trend.useQuery()
  const timeInStageQ = trpc.analytics.timeInStage.useQuery()
  const reviewersQ   = trpc.analytics.reviewers.useQuery()

  const ov = overviewQ.data
  const loading = overviewQ.isLoading

  const kpis = [
    {
      label: 'Total Submissions',
      value: loading ? '—' : ov?.total ?? 0,
      icon: FileText,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Published',
      value: loading ? '—' : ov?.published ?? 0,
      icon: TrendingUp,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: 'Acceptance Rate',
      value: loading ? '—' : ov?.acceptanceRate != null ? `${ov.acceptanceRate}%` : 'N/A',
      icon: CheckCircle,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Active Publications',
      value: loading ? '—' : ov?.publicationCount ?? 0,
      icon: BookOpen,
      color: 'bg-violet-50 text-violet-600',
    },
    {
      label: 'Issues / Volumes',
      value: loading ? '—' : ov?.issueCount ?? 0,
      icon: BookMarked,
      color: 'bg-indigo-50 text-indigo-600',
    },
  ]

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">Publishing metrics and workflow performance</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${k.color}`}>
                  <Icon size={16} aria-hidden="true" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-semibold text-gray-900">{k.value}</p>
              <p className="mt-0.5 text-xs text-gray-500">{k.label}</p>
            </div>
          )
        })}
      </div>

      {/* Trend + Pipeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trend chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-gray-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-gray-800">Submissions — Last 12 Months</h2>
          </div>
          {trendQ.isLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : (
            <>
              <BarChart data={trendQ.data ?? []} />
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-4 rounded-sm bg-brand-200" /> Submitted
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-4 rounded-sm bg-brand-500" /> Published
                </span>
              </div>
            </>
          )}
        </div>

        {/* Pipeline breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} className="text-gray-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-gray-800">Pipeline Breakdown</h2>
          </div>
          {overviewQ.isLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : Object.keys(ov?.statusCounts ?? {}).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No submissions yet</p>
          ) : (
            <PipelineBar statusCounts={ov?.statusCounts ?? {}} />
          )}
        </div>
      </div>

      {/* Time in stage */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Clock size={16} className="text-gray-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-800">Average Time in Stage</h2>
          <span className="ml-auto text-xs text-gray-400">Based on workflow logs</span>
        </div>
        {timeInStageQ.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !timeInStageQ.data?.length ? (
          <p className="text-sm text-gray-400 text-center py-10">
            No workflow data yet — time-in-stage will appear once submissions move through stages
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Stage', 'Avg. Days', 'Sample Size'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {timeInStageQ.data.map((row) => {
                const urgency =
                  row.avgDays > 30 ? 'text-red-600' :
                  row.avgDays > 14 ? 'text-amber-600' :
                  'text-green-600'
                return (
                  <tr key={row.status} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">
                      {row.status.replace(/_/g, ' ')}
                    </td>
                    <td className={`px-5 py-3 font-semibold tabular-nums ${urgency}`}>
                      {row.avgDays}d
                    </td>
                    <td className="px-5 py-3 text-gray-400 tabular-nums">
                      {row.sampleSize} transition{row.sampleSize !== 1 ? 's' : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Reviewer performance */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Users size={16} className="text-gray-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-800">Reviewer Performance</h2>
        </div>
        {reviewersQ.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !reviewersQ.data?.length ? (
          <p className="text-sm text-gray-400 text-center py-10">
            No reviewer data yet
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Reviewer', 'Invited', 'Accepted', 'Declined', 'Submitted', 'Avg Turnaround'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reviewersQ.data
                .sort((a: any, b: any) => b.submitted - a.submitted)
                .map((r: any) => {
                  const acceptRate = r.invited > 0 ? Math.round((r.accepted / r.invited) * 100) : 0
                  return (
                    <tr key={r.reviewer.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">
                          {r.reviewer.firstName} {r.reviewer.lastName}
                        </p>
                        <p className="text-xs text-gray-400">{r.reviewer.email}</p>
                      </td>
                      <td className="px-5 py-3 tabular-nums text-gray-700">{r.invited}</td>
                      <td className="px-5 py-3 tabular-nums">
                        <span className="text-gray-700">{r.accepted}</span>
                        {r.invited > 0 && (
                          <span className="ml-1 text-xs text-gray-400">({acceptRate}%)</span>
                        )}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-gray-700">{r.declined}</td>
                      <td className="px-5 py-3 tabular-nums text-gray-700">{r.submitted}</td>
                      <td className="px-5 py-3 tabular-nums">
                        {r.avgTurnaroundDays != null ? (
                          <span className={
                            r.avgTurnaroundDays > 21 ? 'text-red-600 font-medium' :
                            r.avgTurnaroundDays > 14 ? 'text-amber-600' :
                            'text-green-600'
                          }>
                            {r.avgTurnaroundDays}d
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
