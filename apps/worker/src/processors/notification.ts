import type { Job } from 'bullmq'
import nodemailer from 'nodemailer'
import { NotificationJobSchema } from '@pubflow/types'

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

export async function notificationProcessor(job: Job) {
  const d = NotificationJobSchema.parse(job.data)
  if (!d.to.length) return

  const tpl = TEMPLATES[d.template]
  if (!tpl) { console.warn(`Unknown template: ${d.template}`); return }

  const { subject, html } = tpl(d.data as Record<string,unknown>)

  await Promise.all(d.to.map((to) =>
    transport.sendMail({ from: process.env.SMTP_FROM ?? 'noreply@pubflow.local', to, subject, html })
  ))
  console.info(`✅ [Notification] ${d.template} sent to ${d.to.length} recipient(s)`)
}
