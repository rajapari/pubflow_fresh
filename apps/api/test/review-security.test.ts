// Regression coverage for two bugs found in the July 2026 codebase audit:
//   1. review.listForSubmission masked the wrong field name
//      (`confidentialComments`, which doesn't exist on Review) so the real
//      `confidentialNotes` value passed straight through to authors.
//   2. canAccessManuscript (submission-access.ts) — shared by
//      getManuscriptEditorUrl/DownloadUrl/Versions and wopi.ts — previously
//      didn't exist; READER and unassigned PEER_REVIEWER fell through
//      unchecked to manuscript access.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeCaller, closeTestConnections } from './caller.js'
import { createReviewFixture, type ReviewFixture } from './fixtures.js'

let fx: ReviewFixture
let author: ReturnType<typeof makeCaller>
let editor: ReturnType<typeof makeCaller>
let assignedReviewer: ReturnType<typeof makeCaller>
let unassignedReviewer: ReturnType<typeof makeCaller>
let reader: ReturnType<typeof makeCaller>
let outsider: ReturnType<typeof makeCaller>

beforeAll(async () => {
  fx = await createReviewFixture('review-sec')
  author              = makeCaller({ id: fx.authorId,             tenantId: fx.tenantId, role: 'AUTHOR' })
  editor              = makeCaller({ id: fx.editorId,              tenantId: fx.tenantId, role: 'SECTION_EDITOR' })
  assignedReviewer    = makeCaller({ id: fx.peerReviewerId,        tenantId: fx.tenantId, role: 'PEER_REVIEWER' })
  unassignedReviewer  = makeCaller({ id: fx.unassignedReviewerId,  tenantId: fx.tenantId, role: 'PEER_REVIEWER' })
  reader              = makeCaller({ id: fx.readerId,              tenantId: fx.tenantId, role: 'READER' })
  outsider            = makeCaller({ id: fx.outsiderEditorId,      tenantId: fx.outsiderTenantId, role: 'SECTION_EDITOR' })
})
afterAll(async () => {
  await fx.cleanup()
  await closeTestConnections()
})

describe('review.listForSubmission — confidentialNotes masking', () => {
  it('masks confidentialNotes for the author', async () => {
    const reviews = await author.review.listForSubmission({ submissionId: fx.submissionId })
    expect(reviews).toHaveLength(1)
    expect(reviews[0]?.confidentialNotes).toBeNull()
    // Public comments still visible — only the confidential field is masked
    expect(reviews[0]?.comments).toBe('Public comments for the author.')
  })

  it('does not mask confidentialNotes for editors', async () => {
    const reviews = await editor.review.listForSubmission({ submissionId: fx.submissionId })
    expect(reviews[0]?.confidentialNotes).toBe('Editor-only: I suspect data fabrication.')
  })

  it('blocks cross-tenant access entirely', async () => {
    await expect(outsider.review.listForSubmission({ submissionId: fx.submissionId }))
      .rejects.toThrow(/FORBIDDEN|Forbidden/i)
  })
})

describe('canAccessManuscript — shared by getManuscriptEditorUrl/DownloadUrl/Versions', () => {
  it('the author can access', async () => {
    await expect(author.submission.getManuscriptVersions({ submissionId: fx.submissionId }))
      .resolves.toBeInstanceOf(Array)
  })

  it('editorial staff can access', async () => {
    await expect(editor.submission.getManuscriptVersions({ submissionId: fx.submissionId }))
      .resolves.toBeInstanceOf(Array)
  })

  it('a PEER_REVIEWER assigned to review this submission can access', async () => {
    await expect(assignedReviewer.submission.getManuscriptVersions({ submissionId: fx.submissionId }))
      .resolves.toBeInstanceOf(Array)
  })

  it('a PEER_REVIEWER with no assignment to this submission is denied (blind review)', async () => {
    await expect(unassignedReviewer.submission.getManuscriptVersions({ submissionId: fx.submissionId }))
      .rejects.toThrow(/FORBIDDEN|Forbidden/i)
  })

  it('READER (public-browse role) is denied pre-publication access', async () => {
    await expect(reader.submission.getManuscriptVersions({ submissionId: fx.submissionId }))
      .rejects.toThrow(/FORBIDDEN|Forbidden/i)
  })
})
