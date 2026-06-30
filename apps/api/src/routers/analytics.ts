import { router, editorProcedure } from '../trpc/procedures.js'

export const analyticsRouter = router({

  // KPIs + pipeline status breakdown
  overview: editorProcedure.query(async ({ ctx }) => {
    const { user, prisma } = ctx
    const tenantId = user.tenantId

    const [statusGroups, publicationCount, issueCount, decisionGroups] = await Promise.all([
      prisma.submission.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { id: true },
      }),
      prisma.publication.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.issue.count({ where: { publication: { tenantId } } }),
      prisma.editorialDecision.groupBy({
        by: ['decision'],
        where: { submission: { tenantId } },
        _count: { id: true },
      }),
    ])

    const statusCounts: Record<string, number> = {}
    let total = 0
    for (const g of statusGroups) {
      statusCounts[g.status] = g._count.id
      total += g._count.id
    }

    const decisionCounts: Record<string, number> = {}
    let totalDecisions = 0
    for (const d of decisionGroups) {
      decisionCounts[d.decision] = d._count.id
      totalDecisions += d._count.id
    }

    const accepted = decisionCounts['ACCEPT'] ?? 0
    const rejected = (decisionCounts['REJECT'] ?? 0) + (decisionCounts['DESK_REJECT'] ?? 0)
    const acceptanceRate = totalDecisions > 0 ? Math.round((accepted / totalDecisions) * 100) : null

    return {
      total,
      statusCounts,
      publicationCount,
      issueCount,
      acceptanceRate,
      accepted,
      rejected,
      published: statusCounts['PUBLISHED'] ?? 0,
      inProgress:
        (statusCounts['SUBMITTED'] ?? 0) +
        (statusCounts['DESK_REVIEW'] ?? 0) +
        (statusCounts['PEER_REVIEW'] ?? 0) +
        (statusCounts['REVISION_REQUIRED'] ?? 0) +
        (statusCounts['REVISED'] ?? 0),
    }
  }),

  // Submissions per month — last 12 months
  trend: editorProcedure.query(async ({ ctx }) => {
    const { user, prisma } = ctx
    const since = new Date()
    since.setMonth(since.getMonth() - 11)
    since.setDate(1)
    since.setHours(0, 0, 0, 0)

    const subs = await prisma.submission.findMany({
      where: { tenantId: user.tenantId, createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    })

    // Build ordered 12-month skeleton
    const months: { key: string; label: string; count: number; published: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push({
        key,
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
        count: 0,
        published: 0,
      })
    }

    for (const sub of subs) {
      const key = `${sub.createdAt.getFullYear()}-${String(sub.createdAt.getMonth() + 1).padStart(2, '0')}`
      const m = months.find(m => m.key === key)
      if (m) {
        m.count++
        if (sub.status === 'PUBLISHED') m.published++
      }
    }

    return months
  }),

  // Average days spent in each workflow stage (from WorkflowLog pairs)
  timeInStage: editorProcedure.query(async ({ ctx }) => {
    const logs = await ctx.prisma.workflowLog.findMany({
      where: { submission: { tenantId: ctx.user.tenantId } },
      select: { submissionId: true, fromStatus: true, createdAt: true },
      orderBy: [{ submissionId: 'asc' }, { createdAt: 'asc' }],
    })

    // Group logs by submission
    const byId: Record<string, typeof logs> = {}
    for (const l of logs) {
      ;(byId[l.submissionId] ??= []).push(l)
    }

    // Compute duration between consecutive log entries for each fromStatus
    const durations: Record<string, number[]> = {}
    for (const subLogs of Object.values(byId)) {
      for (let i = 0; i < subLogs.length - 1; i++) {
        const status = subLogs[i].fromStatus
        if (!status) continue
        const days =
          (subLogs[i + 1].createdAt.getTime() - subLogs[i].createdAt.getTime()) / 86_400_000
        ;(durations[status] ??= []).push(days)
      }
    }

    return Object.entries(durations)
      .map(([status, d]) => ({
        status,
        avgDays: Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10,
        sampleSize: d.length,
      }))
      .sort((a, b) => b.avgDays - a.avgDays)
  }),

  // Per-reviewer: invitation/acceptance/submission stats
  reviewers: editorProcedure.query(async ({ ctx }) => {
    const reviews = await ctx.prisma.review.findMany({
      where: { submission: { tenantId: ctx.user.tenantId } },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const byReviewer: Record<
      string,
      {
        reviewer: { id: string; firstName: string | null; lastName: string | null; email: string }
        invited: number
        accepted: number
        declined: number
        submitted: number
        turnarounds: number[]
      }
    > = {}

    for (const r of reviews) {
      const key = r.reviewerId
      if (!byReviewer[key]) {
        byReviewer[key] = {
          reviewer: r.reviewer,
          invited: 0, accepted: 0, declined: 0, submitted: 0, turnarounds: [],
        }
      }
      const s = byReviewer[key]
      s.invited++
      if (r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS') s.accepted++
      if (r.status === 'DECLINED') s.declined++
      if (r.status === 'SUBMITTED') {
        s.submitted++
        if (r.submittedAt) {
          s.turnarounds.push(
            (r.submittedAt.getTime() - r.createdAt.getTime()) / 86_400_000
          )
        }
      }
    }

    return Object.values(byReviewer).map(({ turnarounds, ...r }) => ({
      ...r,
      avgTurnaroundDays:
        turnarounds.length > 0
          ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length)
          : null,
    }))
  }),
})
