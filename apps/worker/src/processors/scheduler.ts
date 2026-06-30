import type { Job } from 'bullmq'
import { Queue } from 'bullmq'
import { QUEUES } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'

// Send a reminder if due within this many days
const REMIND_BEFORE_DAYS = 3
// Don't re-remind a reviewer more often than this
const MIN_REMINDER_GAP_DAYS = 6

function getConnection() {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379/0'
  try {
    const p = new URL(url)
    return {
      host:     p.hostname || 'localhost',
      port:     Number(p.port) || 6379,
      password: p.password || undefined,
      db:       Number(p.pathname?.replace('/', '') || 0),
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
    }
  } catch {
    return { host: 'localhost', port: 6379, password: undefined, db: 0,
             maxRetriesPerRequest: null as null, enableReadyCheck: false }
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function schedulerProcessor(_job: Job) {
  const now          = new Date()
  const soonCutoff   = new Date(now.getTime() + REMIND_BEFORE_DAYS * 86_400_000)
  const minGapCutoff = new Date(now.getTime() - MIN_REMINDER_GAP_DAYS * 86_400_000)

  // Reviews that are active, have a due date ≤ (now + REMIND_BEFORE_DAYS), and
  // haven't been reminded recently.
  const reviews = await prisma.review.findMany({
    where: {
      status: { in: ['INVITED', 'ACCEPTED', 'IN_PROGRESS'] },
      dueAt:  { lte: soonCutoff },
      OR: [
        { lastReminderSentAt: null },
        { lastReminderSentAt: { lte: minGapCutoff } },
      ],
    },
    select: {
      id:           true,
      submissionId: true,
      dueAt:        true,
      status:       true,
      reviewer:     { select: { email: true } },
      submission:   { select: { title: true } },
    },
  })

  if (!reviews.length) {
    console.info('[scheduler] No reviews need reminders today')
    return { sent: 0, markedOverdue: 0 }
  }

  const notifQueue = new Queue(QUEUES.NOTIFICATION, { connection: getConnection() })

  let sent = 0
  let markedOverdue = 0

  for (const review of reviews) {
    const isOverdue  = !!review.dueAt && review.dueAt < now
    const dueDateStr = review.dueAt ? formatDate(review.dueAt) : '(no due date)'

    // Transition status to OVERDUE when past due
    if (isOverdue) {
      await prisma.review.update({
        where: { id: review.id },
        data:  { status: 'OVERDUE', lastReminderSentAt: now },
      })
      markedOverdue++
    } else {
      await prisma.review.update({
        where: { id: review.id },
        data:  { lastReminderSentAt: now },
      })
    }

    await notifQueue.add(`reminder-${review.id}-${Date.now()}`, {
      type:     'NOTIFICATION',
      to:       [review.reviewer.email],
      template: 'REVIEW_REMINDER',
      data: {
        submissionId: review.submissionId,
        title:        review.submission.title,
        dueDate:      dueDateStr,
        isOverdue,
      },
    })

    sent++
  }

  await notifQueue.close()

  console.info(`[scheduler] Review reminders: ${sent} sent, ${markedOverdue} marked OVERDUE`)
  return { sent, markedOverdue }
}
