import type { Job } from 'bullmq'
import nodemailer from 'nodemailer'
import { NotificationJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'mailpit',
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
})

const APP = process.env.APP_URL ?? 'http://localhost:3000'

const TEMPLATES: Record<string, (d: Record<string,unknown>) => { subject: string; html: string }> = {
  SUBMISSION_RECEIVED: (d) => ({
    subject: `New Submission: ${d['title']}`,
    html: `<h2>New Submission Received</h2><p><strong>${d['title']}</strong></p><p><a href="${APP}/dashboard/submissions/${d['submissionId']}">View →</a></p>`,
  }),
  REVIEW_INVITED: (d) => ({
    subject: `Review Invitation: ${d['title']}`,
    html: `<h2>You have been invited to review a manuscript</h2><p><strong>${d['title']}</strong></p><p><a href="${APP}/dashboard/editorial">View →</a></p>`,
  }),
  DECISION_MADE: (d) => ({
    subject: `Editorial Decision: ${d['decision']}`,
    html: `<h2>Decision on your submission</h2><p><strong>Decision:</strong> ${d['decision']}</p><p><a href="${APP}/dashboard/submissions/${d['submissionId']}">View →</a></p>`,
  }),
  REVISION_REQUESTED: (d) => ({
    subject: 'Revision Requested',
    html: `<h2>Revision Requested</h2><p><a href="${APP}/dashboard/submissions/${d['submissionId']}">View Comments →</a></p>`,
  }),
  PROOF_READY: (d) => ({
    subject: 'Your proof is ready',
    html: `<h2>Proof Ready for Review</h2><p><a href="${APP}/dashboard/submissions/${d['submissionId']}">Review Proof →</a></p>`,
  }),
  PUBLISHED: (d) => ({
    subject: 'Your article has been published!',
    html: `<h2>Congratulations!</h2><p><strong>${d['title']}</strong> is now published.</p>`,
  }),
  REVIEW_REMINDER: (d) => ({
    subject: `Review Reminder — due ${d['dueDate']}`,
    html: `<h2>Review Reminder</h2><p>Your review is due on <strong>${d['dueDate']}</strong>.</p><p><a href="${APP}/dashboard/editorial">Submit Review →</a></p>`,
  }),
}

async function resolveRecipients(template: string, data: Record<string, unknown>): Promise<string[]> {
  const submissionId = data['submissionId'] as string | undefined
  const reviewId = data['reviewId'] as string | undefined

  switch (template) {
    case 'SUBMISSION_RECEIVED': {
      if (!submissionId) return []
      // Send to all EDITOR_IN_CHIEF and SECTION_EDITOR in the tenant
      const submission = await prisma.submission.findUnique({ where: { id: submissionId } })
      if (!submission) return []
      const editors = await prisma.user.findMany({
        where: {
          tenantId: submission.tenantId,
          role: { in: ['EDITOR_IN_CHIEF', 'SECTION_EDITOR'] },
          status: 'ACTIVE',
        },
      })
      return editors.map(e => e.email)
    }

    case 'REVIEW_INVITED': {
      if (!reviewId) return []
      // Send to the assigned reviewer
      const review = await prisma.review.findUnique({
        where: { id: reviewId },
        include: { reviewer: true },
      })
      return review ? [review.reviewer.email] : []
    }

    case 'DECISION_MADE': {
      if (!submissionId) return []
      // Send to the submission author
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { author: true },
      })
      return submission ? [submission.author.email] : []
    }

    case 'REVISION_REQUESTED':
    case 'PROOF_READY':
    case 'PUBLISHED': {
      if (!submissionId) return []
      // Send to the submission author
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { author: true },
      })
      return submission ? [submission.author.email] : []
    }

    default:
      return []
  }
}

export async function notificationProcessor(job: Job) {
  const d = NotificationJobSchema.parse(job.data)
  
  // Resolve recipients if not provided
  let recipients = d.to.length > 0 ? d.to : await resolveRecipients(d.template, d.data as Record<string, unknown>)
  
  if (!recipients.length) {
    console.warn(`[Notification] ${d.template}: No recipients found`)
    return
  }

  const tpl = TEMPLATES[d.template]
  if (!tpl) { console.warn(`Unknown template: ${d.template}`); return }

  const { subject, html } = tpl(d.data as Record<string,unknown>)

  await Promise.all(recipients.map((to) =>
    transport.sendMail({ from: process.env.SMTP_FROM ?? 'noreply@pubflow.local', to, subject, html })
  ))
  console.info(`✅ [Notification] ${d.template} sent to ${recipients.length} recipient(s)`)
}
