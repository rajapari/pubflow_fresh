import { z } from 'zod'

export const PublicationTypeSchema = z.enum(['JOURNAL','BOOK','BOOK_SERIES','PROCEEDINGS'])
export type PublicationType = z.infer<typeof PublicationTypeSchema>

export const OutputFormatSchema = z.enum([
  'PDF_PRINT','PDF_WEB','EPUB','HTML','JATS_XML','DOCX','BIBTEX','JSON_LD',
])
export type OutputFormat = z.infer<typeof OutputFormatSchema>

export const LayoutEngineSchema = z.enum(['LATEX','SCRIBUS','PANDOC','WEASYPRINT'])
export type LayoutEngine = z.infer<typeof LayoutEngineSchema>
