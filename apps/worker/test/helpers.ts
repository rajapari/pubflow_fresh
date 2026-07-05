// Shared DB + MinIO fixtures for worker tests. Every fixture lives under a
// throwaway tenant so cleanup is a single cascading delete.
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma.js'
import { uploadToMinio } from '../src/lib/storage.js'

export interface Fixture {
  tenantId: string
  authorId: string
  copyEditorId: string
  editorId: string
  proofReaderId: string
  outsiderTenantId: string
  outsiderEditorId: string
  publicationId: string
  submissionId: string
  cleanup: () => Promise<void>
}

export async function createFixture(prefix = 'test'): Promise<Fixture> {
  const tag = `${prefix}-${randomUUID().slice(0, 8)}`

  const tenant = await prisma.tenant.create({
    data: { name: `Tenant ${tag}`, slug: `tenant-${tag}` },
  })
  const outsiderTenant = await prisma.tenant.create({
    data: { name: `Outsider ${tag}`, slug: `outsider-${tag}` },
  })

  const mkUser = (tenantId: string, role: string, label: string) =>
    prisma.user.create({
      data: {
        tenantId,
        keycloakId: `kc-${tag}-${label}`,
        email: `${label}-${tag}@test.local`,
        role: role as never,
      },
    })

  const author      = await mkUser(tenant.id, 'AUTHOR', 'author')
  const copyEditor  = await mkUser(tenant.id, 'COPY_EDITOR', 'copyeditor')
  const editor      = await mkUser(tenant.id, 'SECTION_EDITOR', 'editor')
  const proofReader = await mkUser(tenant.id, 'PROOF_READER', 'proofreader')
  const outsiderEd  = await mkUser(outsiderTenant.id, 'SECTION_EDITOR', 'outsider')

  const publication = await prisma.publication.create({
    data: { tenantId: tenant.id, title: `Journal ${tag}` },
  })

  const submission = await prisma.submission.create({
    data: {
      tenantId: tenant.id,
      publicationId: publication.id,
      authorId: author.id,
      title: `Test submission ${tag} with a sufficiently long title`,
      keywords: ['testing'],
      status: 'DRAFT',
    },
  })

  return {
    tenantId: tenant.id,
    authorId: author.id,
    copyEditorId: copyEditor.id,
    editorId: editor.id,
    proofReaderId: proofReader.id,
    outsiderTenantId: outsiderTenant.id,
    outsiderEditorId: outsiderEd.id,
    publicationId: publication.id,
    submissionId: submission.id,
    cleanup: async () => {
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenant.id, outsiderTenant.id] } },
      })
    },
  }
}

/** Upload a small fixture file to MinIO and return its key. */
export async function uploadFixture(
  key: string,
  content: Buffer | string,
  mimeType = 'application/octet-stream',
): Promise<string> {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')
  await uploadToMinio(key, buf, mimeType)
  return key
}

/** Tiny valid 1×1 PNG for image-flavored tests. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
