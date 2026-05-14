import { z } from 'zod'

export const PandocJobSchema = z.object({
  type: z.literal('PANDOC'),
  submissionId: z.string().uuid(),
  outputId: z.string().uuid(),
  inputMinioKey: z.string(),
  inputFormat: z.enum(['docx','latex','markdown','odt']),
  outputFormat: z.enum(['pdf','epub','html','jats','docx','bibtex']),
  options: z.object({ citationStyle: z.string().default('apa') }).default({}),
})
export type PandocJob = z.infer<typeof PandocJobSchema>

export const LatexJobSchema = z.object({
  type: z.literal('LATEX'),
  submissionId: z.string().uuid(),
  outputId: z.string().uuid(),
  inputMinioKey: z.string(),
  documentClass: z.string().default('article'),
  engine: z.enum(['xelatex','lualatex','pdflatex']).default('xelatex'),
  passes: z.number().min(1).max(4).default(2),
})
export type LatexJob = z.infer<typeof LatexJobSchema>

export const ScribusJobSchema = z.object({
  type: z.literal('SCRIBUS'),
  submissionId: z.string().uuid(),
  outputId: z.string().uuid(),
  templateMinioKey: z.string(),
  contentMinioKey: z.string(),
  assetMinioKeys: z.array(z.string()).default([]),
  outputFormat: z.enum(['PDF_X4','PDF_X3','PDF']).default('PDF_X4'),
})
export type ScribusJob = z.infer<typeof ScribusJobSchema>

export const ImageJobSchema = z.object({
  type: z.literal('IMAGE'),
  assetId: z.string().uuid(),
  submissionId: z.string().uuid(),
  inputMinioKey: z.string(),
  tasks: z.array(z.enum([
    'VALIDATE_DPI','VALIDATE_COLORMODE','CONVERT_FORMAT',
    'APPLY_ICC','GENERATE_THUMBNAIL','EXTRACT_METADATA','OPTIMIZE_WEB',
  ])),
  targetDpi: z.number().default(300),
  targetColorMode: z.enum(['RGB','CMYK','GRAYSCALE']).optional(),
})
export type ImageJob = z.infer<typeof ImageJobSchema>

export const NotificationJobSchema = z.object({
  type: z.literal('NOTIFICATION'),
  to: z.array(z.string().email()),
  template: z.enum([
    'SUBMISSION_RECEIVED','REVIEW_INVITED','REVIEW_REMINDER',
    'DECISION_MADE','REVISION_REQUESTED','PROOF_READY','PUBLISHED',
  ]),
  data: z.record(z.unknown()),
})
export type NotificationJob = z.infer<typeof NotificationJobSchema>

export const QUEUES = {
  PANDOC: 'pandoc',
  LATEX: 'latex',
  SCRIBUS: 'scribus',
  IMAGE: 'image',
  NOTIFICATION: 'notification',
} as const
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
