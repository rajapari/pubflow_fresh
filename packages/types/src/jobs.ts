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
  // Ported publisher template (.cls) compiled alongside the source.
  templateMinioKey: z.string().optional(),
  templateClassName: z.string().optional(),
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
    'SUBMISSION_RECEIVED','REVIEW_INVITED','REVIEW_SUBMITTED','REVIEW_REMINDER',
    'DECISION_MADE','REVISION_REQUESTED','PROOF_READY','PUBLISHED',
    'COPY_EDIT_ASSIGNED',
  ]),
  data: z.record(z.unknown()),
})
export type NotificationJob = z.infer<typeof NotificationJobSchema>

// ── Intake: file classifier / separator ──────────────────
// Classifies every file in a submission bundle and routes it to the right
// AssetType. Positively separates SUPPLEMENTARY material and the single
// GRAPHICAL_ABSTRACT so they can be linked to the final deliverable.
export const IntakeFileSchema = z.object({
  minioKey: z.string(),
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedById: z.string().uuid(),
  // When present, re-classify (update) this existing Asset instead of creating one.
  assetId: z.string().uuid().optional(),
})
export type IntakeFile = z.infer<typeof IntakeFileSchema>

export const IntakeJobSchema = z.object({
  type: z.literal('INTAKE'),
  submissionId: z.string().uuid(),
  files: z.array(IntakeFileSchema).min(1),
  // Use AI vision to positively identify the graphical abstract among figures.
  useVision: z.boolean().default(true),
})
export type IntakeJob = z.infer<typeof IntakeJobSchema>

// ── Copyediting: pluggable style-manual engine ───────────
// In-house style is just another profile layered on top of a base manual.
export const StyleManualSchema = z.enum([
  'INHOUSE','APA7','CHICAGO17','AMA11','MLA9','VANCOUVER','IEEE','CSE','HARVARD',
])
export type StyleManual = z.infer<typeof StyleManualSchema>

export const CopyEditJobSchema = z.object({
  type: z.literal('COPYEDIT'),
  submissionId: z.string().uuid(),
  copyEditId: z.string().uuid(),
  inputMinioKey: z.string(),
  inputFormat: z.enum(['docx','markdown','latex','odt']),
  styleProfileId: z.string().uuid().optional(),
  styleManual: StyleManualSchema.default('INHOUSE'),
  // CSL style key used by the reference formatter (citeproc/Pandoc).
  cslStyle: z.string().default('apa'),
  // Extra in-house overlay instructions applied on top of the base manual.
  houseRules: z.array(z.string()).default([]),
  // Run the LLM copyeditor pass (tracked changes) after deterministic rules.
  applyAi: z.boolean().default(true),
})
export type CopyEditJob = z.infer<typeof CopyEditJobSchema>

// ── Typesetting: publisher template porting ──────────────
// Recreates a publisher's InDesign (IDML) / LaTeX layout as a reusable
// Scribus or LaTeX template asset on the platform.
export const TemplatePortJobSchema = z.object({
  type: z.literal('TEMPLATE_PORT'),
  templateId: z.string().uuid(),
  sourceMinioKey: z.string(),
  sourceFormat: z.enum(['idml','indd','latex','pdf']),
  targetEngine: z.enum(['SCRIBUS','LATEX']),
})
export type TemplatePortJob = z.infer<typeof TemplatePortJobSchema>

// LaTeX class names may only contain letters. Used by BOTH the template
// generator (\ProvidesClass) and the typesetting router (documentClass +
// .cls filename) — they must always agree or compilation breaks.
export function normalizeTemplateClassName(name: string): string {
  return name.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'pubflowtemplate'
}

export const QUEUES = {
  PANDOC: 'pandoc',
  LATEX: 'latex',
  SCRIBUS: 'scribus',
  IMAGE: 'image',
  NOTIFICATION: 'notification',
  SCHEDULER: 'scheduler',
  INTAKE: 'intake',
  COPYEDIT: 'copyedit',
  TEMPLATE: 'template',
} as const
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
