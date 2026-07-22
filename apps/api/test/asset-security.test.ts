// Regression coverage for the July 2026 audit's asset.ts findings:
//   - approve/reject/delete previously ran with zero tenant scoping
//     (`prisma.asset.update({ where: { id } })` on any ID) — a cross-tenant
//     approve/reject vulnerability.
//   - SUPER_ADMIN was excluded from ASSET_EDITOR_ROLES (inverted-permissions
//     bug: the highest-privilege role couldn't approve/reject anything).
import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../src/lib/prisma.js'
import { makeCaller, closeTestConnections } from './caller.js'

interface Fixture {
  tenantId: string
  outsiderTenantId: string
  assetId: string
  cleanup: () => Promise<void>
}

let fx: Fixture
let editor: ReturnType<typeof makeCaller>
let superAdmin: ReturnType<typeof makeCaller>
let author: ReturnType<typeof makeCaller>
let outsiderEditor: ReturnType<typeof makeCaller>

beforeAll(async () => {
  const tag = `asset-sec-${randomUUID().slice(0, 8)}`
  const tenant = await prisma.tenant.create({ data: { name: `T ${tag}`, slug: `t-${tag}` } })
  const outsiderTenant = await prisma.tenant.create({ data: { name: `O ${tag}`, slug: `o-${tag}` } })

  const mkUser = (tenantId: string, role: string, label: string) =>
    prisma.user.create({
      data: { tenantId, keycloakId: `kc-${tag}-${label}`, email: `${label}-${tag}@test.local`, role: role as never },
    })

  const authorUser = await mkUser(tenant.id, 'AUTHOR', 'author')
  const editorUser = await mkUser(tenant.id, 'SECTION_EDITOR', 'ed')
  const adminUser  = await mkUser(tenant.id, 'SUPER_ADMIN', 'admin')
  const outsiderEd = await mkUser(outsiderTenant.id, 'SECTION_EDITOR', 'out')

  const publication = await prisma.publication.create({ data: { tenantId: tenant.id, title: `Journal ${tag}` } })
  const submission = await prisma.submission.create({
    data: {
      tenantId: tenant.id, publicationId: publication.id, authorId: authorUser.id,
      title: `Asset test submission ${tag} long enough`, keywords: ['t'], status: 'ACCEPTED',
    },
  })
  const asset = await prisma.asset.create({
    data: {
      submissionId: submission.id, uploadedById: authorUser.id, filename: 'figure1.png',
      assetType: 'FIGURE', minioKey: `${tenant.id}/${submission.id}/assets/figure1.png`,
      mimeType: 'image/png', fileSizeBytes: 1024, status: 'PENDING',
    },
  })

  author         = makeCaller({ id: authorUser.id, tenantId: tenant.id, role: 'AUTHOR' })
  editor         = makeCaller({ id: editorUser.id, tenantId: tenant.id, role: 'SECTION_EDITOR' })
  superAdmin     = makeCaller({ id: adminUser.id,  tenantId: tenant.id, role: 'SUPER_ADMIN' })
  outsiderEditor = makeCaller({ id: outsiderEd.id, tenantId: outsiderTenant.id, role: 'SECTION_EDITOR' })

  fx = {
    tenantId: tenant.id,
    outsiderTenantId: outsiderTenant.id,
    assetId: asset.id,
    cleanup: async () => {
      await prisma.submission.deleteMany({ where: { tenantId: { in: [tenant.id, outsiderTenant.id] } } })
      await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, outsiderTenant.id] } } })
    },
  }
})
afterAll(async () => {
  await fx.cleanup()
  await closeTestConnections()
})

describe('asset.approve / asset.reject — tenant scoping', () => {
  it('a same-tenant author cannot approve (editor-only action)', async () => {
    await expect(author.asset.approve({ id: fx.assetId })).rejects.toThrow(/artwork editors/i)
  })

  it('an editor from a different tenant cannot approve someone else\'s asset', async () => {
    await expect(outsiderEditor.asset.approve({ id: fx.assetId })).rejects.toThrow()
  })

  it('SUPER_ADMIN can approve (previously excluded — inverted permissions)', async () => {
    const approved = await superAdmin.asset.approve({ id: fx.assetId })
    expect(approved.status).toBe('APPROVED')
  })

  it('an editor from a different tenant cannot reject someone else\'s asset', async () => {
    await expect(outsiderEditor.asset.reject({ id: fx.assetId, reason: 'sneaky' })).rejects.toThrow()
  })

  it('same-tenant editor can reject', async () => {
    const rejected = await editor.asset.reject({ id: fx.assetId, reason: 'Please resubmit at 300 DPI' })
    expect(rejected.status).toBe('NEEDS_REVISION')
  })
})
