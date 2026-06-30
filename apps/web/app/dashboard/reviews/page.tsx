'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/Form'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { toast } from 'sonner'
import { Clock, CheckCircle, XCircle, PenLine, BookOpen } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type FilterKey = 'ALL' | 'INVITED' | 'ACCEPTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'DECLINED'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL',         label: 'All'         },
  { key: 'INVITED',     label: 'Invited'     },
  { key: 'ACCEPTED',    label: 'Accepted'    },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'SUBMITTED',   label: 'Submitted'   },
  { key: 'DECLINED',    label: 'Declined'    },
]

export default function ReviewsPage() {
  const router  = useRouter()
  const [filter, setFilter] = React.useState<FilterKey>('ALL')

  const reviews      = trpc.review.list.useQuery({})
  const acceptM      = trpc.review.acceptInvitation.useMutation()
  const declineM     = trpc.review.declineInvitation.useMutation()
  const startM       = trpc.review.startReview.useMutation()

  const handleAccept = async (reviewId: string) => {
    try {
      await acceptM.mutateAsync({ reviewId })
      toast.success('Invitation accepted')
      reviews.refetch()
    } catch { toast.error('Failed to accept invitation') }
  }

  const handleDecline = async (reviewId: string) => {
    try {
      await declineM.mutateAsync({ reviewId })
      toast.success('Invitation declined')
      reviews.refetch()
    } catch { toast.error('Failed to decline invitation') }
  }

  const handleStart = async (reviewId: string) => {
    try {
      await startM.mutateAsync({ reviewId })
      toast.success('Review started')
      reviews.refetch()
      router.push(`/dashboard/reviews/${reviewId}`)
    } catch { toast.error('Failed to start review') }
  }

  const allReviews: any[] = (reviews.data as any)?.reviews ?? reviews.data ?? []
  const filtered = allReviews.filter((r: any) => filter === 'ALL' || r.status === filter)

  // Count per status for badges
  const counts = React.useMemo(() => {
    const map: Record<string, number> = {}
    allReviews.forEach((r: any) => { map[r.status] = (map[r.status] ?? 0) + 1 })
    return map
  }, [allReviews])

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">My Reviews</h1>
        <p className="mt-1 text-sm text-gray-500">Peer review assignments for your account</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(({ key, label }) => {
          const count = key === 'ALL' ? allReviews.length : (counts[key] ?? 0)
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
      {reviews.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 py-16">
          <BookOpen size={36} className="text-gray-300 mb-3" aria-hidden="true" />
          <p className="text-sm text-gray-500">No reviews in this category</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((review: any) => (
            <div key={review.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => router.push(`/dashboard/submissions/${review.submissionId}`)}
                    className="text-sm font-semibold text-brand-600 hover:underline text-left truncate block max-w-lg"
                  >
                    {review.submission?.title ?? 'Unknown submission'}
                  </button>
                  <p className="mt-0.5 text-xs text-gray-500">
                    By {review.submission?.author?.firstName} {review.submission?.author?.lastName}
                    {review.dueAt && (
                      <span className={`ml-3 inline-flex items-center gap-1 ${new Date(review.dueAt) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                        <Clock size={11} />
                        Due {formatDate(review.dueAt)}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={review.status} />

                  {review.status === 'INVITED' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleAccept(review.id)} loading={acceptM.isPending}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleDecline(review.id)} loading={declineM.isPending}>
                        Decline
                      </Button>
                    </div>
                  )}

                  {review.status === 'ACCEPTED' && (
                    <Button size="sm" onClick={() => handleStart(review.id)} loading={startM.isPending}>
                      <PenLine size={13} className="mr-1" /> Start Review
                    </Button>
                  )}

                  {review.status === 'IN_PROGRESS' && (
                    <Button size="sm" onClick={() => router.push(`/dashboard/reviews/${review.id}`)}>
                      <PenLine size={13} className="mr-1" /> Continue
                    </Button>
                  )}

                  {review.status === 'SUBMITTED' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                      <CheckCircle size={14} /> Submitted
                    </span>
                  )}

                  {review.status === 'DECLINED' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
                      <XCircle size={14} /> Declined
                    </span>
                  )}
                </div>
              </div>

              {review.status === 'SUBMITTED' && review.recommendation && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium">Recommendation:</span>
                  <span className="capitalize">{review.recommendation.replace('_', ' ')}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
