// DB fixtures for API tests — one throwaway tenant per fixture, mirrored
// from the worker test helpers but built on the API's prisma instance.
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma.js'

export interface ApiFixture {
  tenantId: string
  authorId: string
  copyEditorId: string
  editorId: string
  typesetterId: string
  proofReaderId: string
  outsiderTenantId: string
  outsiderEditorId: string
  publicationId: string
  submissionId: string
  proofReviewId: string
  cleanup: () => Promise<void>
}

export interface ReviewFixture {
  tenantId: string
  authorId: string
  editorId: string
  peerReviewerId: string
  unassignedReviewerId: string
  readerId: string
  outsiderTenantId: string
  outsiderEditorId: string
  publicationId: string
  submissionId: string
  reviewId: string
  cleanup: () => Promise<void>
}

/** Submission in ACCEPTED status (past PEER_REVIEW) with one SUBMITTED review
 *  carrying confidentialNotes, plus a second PEER_REVIEWER never assigned to
 *  anything — for exercising review.listForSubmission masking and
 *  submission.ts's canAccessManuscript assigned-reviewer gate. */
export async function createReviewFixture(prefix = 'api'): Promise<ReviewFixture> {
  const tag = `${prefix}-${randomUUID().slice(0, 8)}`

  const tenant = await prisma.tenant.create({ data: { name: `T ${tag}`, slug: `t-${tag}` } })
  const outsiderTenant = await prisma.tenant.create({ data: { name: `O ${tag}`, slug: `o-${tag}` } })

  const mkUser = (tenantId: string, role: string, label: string) =>
    prisma.user.create({
      data: {
        tenantId, keycloakId: `kc-${tag}-${label}`,
        email: `${label}-${tag}@test.local`, role: role as never,
      },
    })

  const author       = await mkUser(tenant.id, 'AUTHOR', 'author')
  const editor       = await mkUser(tenant.id, 'SECTION_EDITOR', 'ed')
  const peerReviewer = await mkUser(tenant.id, 'PEER_REVIEWER', 'pr')
  const unassigned   = await mkUser(tenant.id, 'PEER_REVIEWER', 'pr2')
  const reader       = await mkUser(tenant.id, 'READER', 'reader')
  const outsiderEd   = await mkUser(outsiderTenant.id, 'SECTION_EDITOR', 'out')

  const publication = await prisma.publication.create({
    data: { tenantId: tenant.id, title: `Journal ${tag}` },
  })
  const submission = await prisma.submission.create({
    data: {
      tenantId: tenant.id, publicationId: publication.id, authorId: author.id,
      title: `Review test submission ${tag} long enough`, keywords: ['t'],
      status: 'ACCEPTED',
    },
  })
  const review = await prisma.review.create({
    data: {
      submissionId: submission.id, reviewerId: peerReviewer.id,
      status: 'SUBMITTED', recommendation: 'MINOR_REVISION',
      comments: 'Public comments for the author.',
      confidentialNotes: 'Editor-only: I suspect data fabrication.',
      submittedAt: new Date(),
    },
  })

  return {
    tenantId: tenant.id,
    authorId: author.id,
    editorId: editor.id,
    peerReviewerId: peerReviewer.id,
    unassignedReviewerId: unassigned.id,
    readerId: reader.id,
    outsiderTenantId: outsiderTenant.id,
    outsiderEditorId: outsiderEd.id,
    publicationId: publication.id,
    submissionId: submission.id,
    reviewId: review.id,
    cleanup: async () => {
      await prisma.submission.deleteMany({
        where: { tenantId: { in: [tenant.id, outsiderTenant.id] } },
      })
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenant.id, outsiderTenant.id] } },
      })
    },
  }
}

export async function createProofFixture(prefix = 'api'): Promise<ApiFixture> {
  const tag = `${prefix}-${randomUUID().slice(0, 8)}`

  const tenant = await prisma.tenant.create({ data: { name: `T ${tag}`, slug: `t-${tag}` } })
  const outsiderTenant = await prisma.tenant.create({ data: { name: `O ${tag}`, slug: `o-${tag}` } })

  const mkUser = (tenantId: string, role: string, label: string) =>
    prisma.user.create({
      data: {
        tenantId, keycloakId: `kc-${tag}-${label}`,
        email: `${label}-${tag}@test.local`, role: role as never,
      },
    })

  const author      = await mkUser(tenant.id, 'AUTHOR', 'author')
  const copyEditor  = await mkUser(tenant.id, 'COPY_EDITOR', 'ce')
  const editor      = await mkUser(tenant.id, 'SECTION_EDITOR', 'ed')
  const typesetter  = await mkUser(tenant.id, 'TYPESETTER', 'ts')
  const proofReader = await mkUser(tenant.id, 'PROOF_READER', 'pr')
  const outsiderEd  = await mkUser(outsiderTenant.id, 'SECTION_EDITOR', 'out')

  const publication = await prisma.publication.create({
    data: { tenantId: tenant.id, title: `Journal ${tag}` },
  })
  const submission = await prisma.submission.create({
    data: {
      tenantId: tenant.id, publicationId: publication.id, authorId: author.id,
      title: `Proof test submission ${tag} long enough`, keywords: ['t'],
      status: 'PROOF_REVIEW',
    },
  })
  const proofReview = await prisma.proofReview.create({
    data: { submissionId: submission.id, reviewerId: proofReader.id },
  })

  return {
    tenantId: tenant.id,
    authorId: author.id,
    copyEditorId: copyEditor.id,
    editorId: editor.id,
    typesetterId: typesetter.id,
    proofReaderId: proofReader.id,
    outsiderTenantId: outsiderTenant.id,
    outsiderEditorId: outsiderEd.id,
    publicationId: publication.id,
    submissionId: submission.id,
    proofReviewId: proofReview.id,
    cleanup: async () => {
      await prisma.submission.deleteMany({
        where: { tenantId: { in: [tenant.id, outsiderTenant.id] } },
      })
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenant.id, outsiderTenant.id] } },
      })
    },
  }
}
