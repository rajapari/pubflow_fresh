// Stage 5 — Online proof workbench API: role gating, validation rules,
// label sequencing, tenant isolation, and the submit lock.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../src/lib/prisma.js'
import { makeCaller, registerTestFileForCleanup } from './caller.js'
import { createProofFixture, type ApiFixture } from './fixtures.js'

let fx: ApiFixture
let author: ReturnType<typeof makeCaller>
let editor: ReturnType<typeof makeCaller>
let copyEditor: ReturnType<typeof makeCaller>
let proofReader: ReturnType<typeof makeCaller>
let outsider: ReturnType<typeof makeCaller>
const teardownSharedConnections = registerTestFileForCleanup()

beforeAll(async () => {
  fx = await createProofFixture('proof')
  author      = makeCaller({ id: fx.authorId,      tenantId: fx.tenantId, role: 'AUTHOR' })
  editor      = makeCaller({ id: fx.editorId,      tenantId: fx.tenantId, role: 'SECTION_EDITOR' })
  copyEditor  = makeCaller({ id: fx.copyEditorId,  tenantId: fx.tenantId, role: 'COPY_EDITOR' })
  proofReader = makeCaller({ id: fx.proofReaderId, tenantId: fx.tenantId, role: 'PROOF_READER' })
  outsider    = makeCaller({ id: fx.outsiderEditorId, tenantId: fx.outsiderTenantId, role: 'SECTION_EDITOR' })
})
afterAll(async () => {
  await fx.cleanup()
  await teardownSharedConnections()
})

describe('queries', () => {
  it('authors cannot raise production queries', async () => {
    await expect(author.proofReview.addQuery({
      proofReviewId: fx.proofReviewId, question: 'Can I ask this?',
    })).rejects.toThrow(/production staff/i)
  })

  it('copyeditor raises Q1, typesetter raises Q2 (sequential labels)', async () => {
    const q1 = await copyEditor.proofReview.addQuery({
      proofReviewId: fx.proofReviewId, question: 'Please confirm the corresponding author.', page: 1,
    })
    expect(q1.label).toBe('Q1')
    expect(q1.status).toBe('OPEN')

    const typesetter = makeCaller({ id: fx.typesetterId, tenantId: fx.tenantId, role: 'TYPESETTER' })
    const q2 = await typesetter.proofReview.addQuery({
      proofReviewId: fx.proofReviewId, question: 'Figure 2 exceeds the column width — crop or scale?', page: 3,
    })
    expect(q2.label).toBe('Q2')
  })

  it('cross-tenant editors are blocked', async () => {
    await expect(outsider.proofReview.addQuery({
      proofReviewId: fx.proofReviewId, question: 'Sneaky outsider query',
    })).rejects.toThrow(/FORBIDDEN|Forbidden/i)
  })

  it('author answers a query; status moves to ANSWERED with audit fields', async () => {
    const q = await prisma.proofQuery.findFirstOrThrow({
      where: { proofReviewId: fx.proofReviewId, label: 'Q1' },
    })
    const answered = await author.proofReview.answerQuery({
      queryId: q.id, answer: 'Jane Doe is the corresponding author.',
    })
    expect(answered.status).toBe('ANSWERED')
    expect(answered.answeredById).toBe(fx.authorId)
    expect(answered.answeredAt).toBeTruthy()
  })

  it('a stranger cannot answer', async () => {
    const q = await prisma.proofQuery.findFirstOrThrow({
      where: { proofReviewId: fx.proofReviewId, label: 'Q2' },
    })
    await expect(outsider.proofReview.answerQuery({ queryId: q.id, answer: 'nope' }))
      .rejects.toThrow(/FORBIDDEN|Forbidden/i)
  })

  it('only production staff resolve queries', async () => {
    const q = await prisma.proofQuery.findFirstOrThrow({
      where: { proofReviewId: fx.proofReviewId, label: 'Q1' },
    })
    await expect(author.proofReview.resolveQuery({ queryId: q.id })).rejects.toThrow()
    const resolved = await copyEditor.proofReview.resolveQuery({ queryId: q.id })
    expect(resolved.status).toBe('RESOLVED')
  })
})

describe('corrections', () => {
  it('REPLACE without targetText is rejected', async () => {
    await expect(author.proofReview.addCorrection({
      proofReviewId: fx.proofReviewId, kind: 'REPLACE', newText: 'new words',
    })).rejects.toThrow(/targetText/)
  })

  it('INSERT without newText is rejected', async () => {
    await expect(author.proofReview.addCorrection({
      proofReviewId: fx.proofReviewId, kind: 'INSERT', note: 'insert something',
    })).rejects.toThrow(/newText/)
  })

  it('author marks a REPLACE correction', async () => {
    const c = await author.proofReview.addCorrection({
      proofReviewId: fx.proofReviewId, kind: 'REPLACE', page: 2,
      targetText: 'teh results', newText: 'the results', note: 'typo',
    })
    expect(c.status).toBe('OPEN')
    expect(c.markedById).toBe(fx.authorId)
  })

  it('only the owner may delete an OPEN correction; editors may too', async () => {
    const own = await author.proofReview.addCorrection({
      proofReviewId: fx.proofReviewId, kind: 'COMMENT', note: 'temp note',
    })
    await expect(proofReader.proofReview.deleteCorrection({ correctionId: own.id }))
      .rejects.toThrow(/FORBIDDEN|Forbidden/i)
    await author.proofReview.deleteCorrection({ correctionId: own.id })
    await expect(prisma.proofCorrection.findUniqueOrThrow({ where: { id: own.id } }))
      .rejects.toThrow()
  })

  it('authors cannot action corrections; typesetters can', async () => {
    const c = await prisma.proofCorrection.findFirstOrThrow({
      where: { proofReviewId: fx.proofReviewId, kind: 'REPLACE' },
    })
    await expect(author.proofReview.setCorrectionStatus({
      correctionId: c.id, status: 'ACCEPTED',
    })).rejects.toThrow()

    const typesetter = makeCaller({ id: fx.typesetterId, tenantId: fx.tenantId, role: 'TYPESETTER' })
    const accepted = await typesetter.proofReview.setCorrectionStatus({
      correctionId: c.id, status: 'ACCEPTED',
    })
    expect(accepted.status).toBe('ACCEPTED')
    expect(accepted.resolvedById).toBe(fx.typesetterId)
  })

  it('accepted corrections can no longer be deleted', async () => {
    const c = await prisma.proofCorrection.findFirstOrThrow({
      where: { proofReviewId: fx.proofReviewId, status: 'ACCEPTED' },
    })
    await expect(editor.proofReview.deleteCorrection({ correctionId: c.id }))
      .rejects.toThrow(/OPEN/)
  })
})

describe('workbench aggregate', () => {
  it('returns review, queries, corrections, role flags; null pdfUrl without output', async () => {
    const wb = await author.proofReview.workbench({ proofReviewId: fx.proofReviewId })
    expect(wb.review.queries.length).toBeGreaterThanOrEqual(2)
    expect(wb.review.corrections.length).toBeGreaterThanOrEqual(1)
    expect(wb.pdfUrl).toBeNull()
    expect(wb.role).toMatchObject({ isAuthor: true, isReviewer: false })

    const wbReader = await proofReader.proofReview.workbench({ proofReviewId: fx.proofReviewId })
    expect(wbReader.role).toMatchObject({ isAuthor: false, isReviewer: true, isEditor: true })
  })

  it('outsiders are blocked entirely', async () => {
    await expect(outsider.proofReview.workbench({ proofReviewId: fx.proofReviewId }))
      .rejects.toThrow(/FORBIDDEN|Forbidden/i)
  })
})

describe('submit lock', () => {
  it('after the proof review is SUBMITTED, new corrections are refused', async () => {
    await prisma.proofReview.update({
      where: { id: fx.proofReviewId }, data: { status: 'SUBMITTED' },
    })
    await expect(author.proofReview.addCorrection({
      proofReviewId: fx.proofReviewId, kind: 'COMMENT', note: 'too late',
    })).rejects.toThrow(/closed/i)
  })
})
