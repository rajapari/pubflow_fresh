import { z } from 'zod'

export const SubmissionStatusSchema = z.enum([
  'DRAFT','SUBMITTED','DESK_REVIEW','PEER_REVIEW','REVISION_REQUIRED',
  'REVISED','ACCEPTED','COPY_EDITING','ARTWORK_PROCESSING','TYPESETTING',
  'PROOF_REVIEW','APPROVED','PUBLISHED','REJECTED','WITHDRAWN',
])
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>

export const VALID_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  DRAFT:              ['SUBMITTED','WITHDRAWN'],
  SUBMITTED:          ['DESK_REVIEW','REJECTED','WITHDRAWN'],
  DESK_REVIEW:        ['PEER_REVIEW','REVISION_REQUIRED','REJECTED'],
  PEER_REVIEW:        ['REVISION_REQUIRED','ACCEPTED','REJECTED'],
  REVISION_REQUIRED:  ['REVISED','WITHDRAWN'],
  REVISED:            ['PEER_REVIEW','ACCEPTED','REJECTED'],
  ACCEPTED:           ['COPY_EDITING'],
  COPY_EDITING:       ['ARTWORK_PROCESSING'],
  ARTWORK_PROCESSING: ['TYPESETTING'],
  TYPESETTING:        ['PROOF_REVIEW'],
  PROOF_REVIEW:       ['APPROVED','TYPESETTING'],
  APPROVED:           ['PUBLISHED'],
  PUBLISHED:          [],
  REJECTED:           [],
  WITHDRAWN:          [],
}

export function isValidTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export const CreateSubmissionSchema = z.object({
  publicationId: z.string().uuid(),
  title: z.string().min(10, 'Title must be at least 10 characters').max(500),
  abstract: z.string().min(50, 'Abstract must be at least 50 characters').max(5000).optional(),
  keywords: z.array(z.string().min(2).max(50)).min(1).max(10),
  coAuthors: z.array(z.object({
    name: z.string(),
    email: z.string().email(),
    affiliation: z.string().optional(),
    orcid: z.string().optional(),
  })).default([]),
})
export type CreateSubmission = z.infer<typeof CreateSubmissionSchema>

export const EditorialDecisionSchema = z.object({
  decision: z.enum(['ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','DESK_REJECT']),
  notes: z.string().optional(),
})
export type EditorialDecision = z.infer<typeof EditorialDecisionSchema>
