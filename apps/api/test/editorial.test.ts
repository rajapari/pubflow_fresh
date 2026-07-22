// Phase C — reviewer matcher (COI exclusions, deterministic ranking) and
// decision-letter drafts (template fallback without AI).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma.js'
import { makeCaller, registerTestFileForCleanup } from './caller.js'
import { createProofFixture, type ApiFixture } from './fixtures.js'

let fx: ApiFixture
let editor: ReturnType<typeof makeCaller>
const KEY_BACKUP = process.env.ANTHROPIC_API_KEY
const teardownSharedConnections = registerTestFileForCleanup()

async function addReviewer(label: string, affiliation: string | null, email?: string) {
  return prisma.user.create({
    data: {
      tenantId: fx.tenantId, keycloakId: `kc-ed-${label}-${randomUUID().slice(0, 6)}`,
      email: email ?? `${label}-${randomUUID().slice(0, 6)}@rev.local`,
      role: 'PEER_REVIEWER', affiliation,
      firstName: label, lastName: 'Reviewer',
    },
  })
}

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY // deterministic paths only
  fx = await createProofFixture('edint')
  editor = makeCaller({ id: fx.editorId, tenantId: fx.tenantId, role: 'SECTION_EDITOR' })
  await prisma.user.update({ where: { id: fx.authorId }, data: { affiliation: 'Uni A' } })
  await prisma.submission.update({
    where: { id: fx.submissionId },
    data: {
      keywords: ['genomics', 'sequencing'],
      coAuthors: [{ name: 'Co A', email: 'coauthor@rev.local' }],
    },
  })
})
afterAll(async () => {
  await fx.cleanup()
  await teardownSharedConnections()
  if (KEY_BACKUP !== undefined) process.env.ANTHROPIC_API_KEY = KEY_BACKUP
})

describe('suggestReviewers', () => {
  it('applies hard COI exclusions and ranks by keyword overlap then load', async () => {
    const clean       = await addReviewer('clean', 'Uni B')
    const experienced = await addReviewer('experienced', 'Uni C')
    const sameAffil   = await addReviewer('conflicted', 'Uni A')
    await addReviewer('coauthor', 'Uni D', 'coauthor@rev.local')

    // Give "experienced" a topical history: a SUBMITTED review on a genomics submission.
    const other = await prisma.submission.create({
      data: {
        tenantId: fx.tenantId, publicationId: fx.publicationId, authorId: fx.authorId,
        title: 'Prior genomics paper with a sufficiently long title',
        keywords: ['genomics'], status: 'PUBLISHED',
      },
    })
    await prisma.review.create({
      data: { submissionId: other.id, reviewerId: experienced.id, status: 'SUBMITTED' },
    })

    const res = await editor.editorial.suggestReviewers({ submissionId: fx.submissionId })

    const ids = res.candidates.map((c: { id: string }) => c.id)
    expect(ids).toContain(clean.id)
    expect(ids).toContain(experienced.id)
    expect(ids).not.toContain(sameAffil.id)
    expect(res.excluded.map((e: { reason: string }) => e.reason)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/same affiliation/),
        expect.stringMatching(/co-author/),
      ]),
    )
    // Topical overlap must outrank a topically-blank candidate.
    expect(ids.indexOf(experienced.id)).toBeLessThan(ids.indexOf(clean.id))
    expect(res.aiRanked).toBe(false)
  })
})

describe('draftDecisionLetter', () => {
  it('without AI: deterministic template embeds decision + reviews', async () => {
    await prisma.review.create({
      data: {
        submissionId: fx.submissionId, reviewerId: fx.proofReaderId,
        status: 'SUBMITTED', comments: 'Solid methods; clarify limitations.',
        recommendation: 'MINOR_REVISION', submittedAt: new Date(),
      },
    })
    const res = await editor.editorial.draftDecisionLetter({
      submissionId: fx.submissionId, decision: 'MINOR_REVISION',
    })
    expect(res.source).toBe('template')
    expect(res.reviewCount).toBe(1)
    expect(res.letter).toContain('minor revision')
    expect(res.letter).toContain('Solid methods; clarify limitations.')
    expect(res.letter).toContain('The Editorial Team')
  })

  it('authors cannot draft decision letters', async () => {
    const author = makeCaller({ id: fx.authorId, tenantId: fx.tenantId, role: 'AUTHOR' })
    await expect(author.editorial.draftDecisionLetter({
      submissionId: fx.submissionId, decision: 'ACCEPT',
    })).rejects.toThrow(/FORBIDDEN|Requires/i)
  })
})
