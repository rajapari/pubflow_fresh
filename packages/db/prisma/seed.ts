import { PrismaClient } from '../generated/client/index.js'
// Single source of truth for the publisher → publication catalogue.
import { seedDefaultCatalog } from '../catalog.mjs'

const prisma = new PrismaClient()


// Calls Keycloak Admin REST API to create a user and return their keycloakId.
// Returns null (with a warning) if Keycloak is not reachable — seed continues without user creation.
async function createKeycloakUser(
  email: string,
  firstName: string,
  lastName: string,
  password: string,
): Promise<string | null> {
  const KC_URL      = process.env.KEYCLOAK_URL            ?? 'http://localhost:8080'
  const KC_REALM    = process.env.KEYCLOAK_REALM          ?? 'pubflow'
  const KC_ADMIN_PW = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'Admin@PubFlow2025'

  try {
    // 1. Get admin token from master realm
    const tokenRes = await fetch(
      `${KC_URL}/realms/master/protocol/openid-connect/token`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id:  'admin-cli',
          username:   'admin',
          password:   KC_ADMIN_PW,
        }),
        signal: AbortSignal.timeout(15000),
      },
    )
    if (!tokenRes.ok) {
      console.warn(`⚠️  Keycloak admin token failed (${tokenRes.status}) — skipping user creation`)
      return null
    }
    const { access_token } = await tokenRes.json() as { access_token: string }

    // 2. Create user
    const createRes = await fetch(
      `${KC_URL}/admin/realms/${KC_REALM}/users`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
        body: JSON.stringify({
          username:      email,
          email,
          firstName,
          lastName,
          enabled:       true,
          emailVerified: true,
          credentials:   [{ type: 'password', value: password, temporary: false }],
        }),
      },
    )

    if (createRes.status === 409) {
      // User already exists — fetch their ID and force-reset the password so
      // the credentials we print are always valid regardless of prior state
      const searchRes = await fetch(
        // exact=true is critical: Keycloak's default email search is substring
        // matching, so "editor@…" would also match "copyeditor@…" and hand
        // back the wrong account's ID.
        `${KC_URL}/admin/realms/${KC_REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      )
      const users = await searchRes.json() as Array<{ id: string }>
      if (users.length > 0) {
        await fetch(
          `${KC_URL}/admin/realms/${KC_REALM}/users/${users[0].id}/reset-password`,
          {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
            body:    JSON.stringify({ type: 'password', value: password, temporary: false }),
          },
        )
        return users[0].id
      }
      return null
    }

    if (!createRes.ok) {
      console.warn(`⚠️  Could not create Keycloak user ${email}: ${createRes.status}`)
      return null
    }

    // 3. Extract user ID from Location header
    const location = createRes.headers.get('Location') ?? ''
    const keycloakId = location.split('/').pop() ?? ''
    return keycloakId || null

  } catch (err: any) {
    console.warn(`⚠️  Keycloak not reachable (${err.message}) — skipping user creation`)
    console.warn('    Start Docker services first: docker compose -f infra/docker/docker-compose.yml up -d')
    return null
  }
}

async function main() {
  console.info('🌱 Seeding database...')

  // ── Tenants ──────────────────────────────────────────────────────────────

  const superTenant = await prisma.tenant.upsert({
    where:  { slug: 'pubflow-admin' },
    update: {},
    create: {
      name: 'PubFlow Administration',
      slug: 'pubflow-admin',
      plan: 'ENTERPRISE',
      settings: { create: { primaryColor: '#534AB7' } },
    },
  })
  console.info(`✅ Super tenant:  ${superTenant.slug}`)

  const demoTenant = await prisma.tenant.upsert({
    where:  { slug: 'demo-journal' },
    update: {},
    create: {
      name: 'Demo Journal of Science',
      slug: 'demo-journal',
      plan: 'PROFESSIONAL',
      settings: {
        create: {
          primaryColor:          '#0F6E56',
          defaultCitationStyle:  'vancouver',
          enablePeerReview:      true,
          enableDoiRegistration: true,
          doiPrefix:             '10.99999',
        },
      },
    },
  })
  console.info(`✅ Demo tenant:   ${demoTenant.slug}`)

  // ── Publications ─────────────────────────────────────────────────────────

  // Remove the old non-UUID seed record so it doesn't pollute the dropdown
  await prisma.publication.deleteMany({ where: { id: 'demo-pub-001' } })

  // In-house test journals live under a "PubFlow Press" publisher so they
  // appear in the cascading publisher → journal dropdown alongside the
  // real-world catalogue.
  const adminHouse = await prisma.publisher.upsert({
    where:  { tenantId_name: { tenantId: superTenant.id, name: 'PubFlow Press' } },
    update: {},
    create: { tenantId: superTenant.id, name: 'PubFlow Press' },
  })
  await prisma.publication.upsert({
    where:  { id: 'b0000000-0000-0000-0000-000000000001' },
    update: { publisherId: adminHouse.id },
    create: {
      id:          'b0000000-0000-0000-0000-000000000001',
      tenantId:    superTenant.id,
      publisherId: adminHouse.id,
      title:       'PubFlow Internal Journal',
      type:        'JOURNAL',
      description: 'Internal test journal for PubFlow administration.',
    },
  })
  console.info(`✅ Admin publication: PubFlow Internal Journal`)

  const demoHouse = await prisma.publisher.upsert({
    where:  { tenantId_name: { tenantId: demoTenant.id, name: 'PubFlow Press' } },
    update: {},
    create: { tenantId: demoTenant.id, name: 'PubFlow Press' },
  })
  const demoPub = await prisma.publication.upsert({
    where:  { id: 'a0000000-0000-0000-0000-000000000001' },
    update: { publisherId: demoHouse.id },
    create: {
      id:          'a0000000-0000-0000-0000-000000000001',
      tenantId:    demoTenant.id,
      publisherId: demoHouse.id,
      title:       'Demo Journal of Science',
      type:        'JOURNAL',
      issn:        '0000-0000',
      description: 'A demonstration journal for PubFlow platform testing.',
    },
  })
  console.info(`✅ Demo publication: ${demoPub.title}`)

  // Seed the publisher → publication catalogue into both tenants so every
  // user sees the cascading publisher/journal dropdowns populated.
  await seedDefaultCatalog(prisma, demoTenant.id)
  await seedDefaultCatalog(prisma, superTenant.id)
  console.info('✅ Seeded publisher catalogue → demo + admin tenants')

  // ── Users ────────────────────────────────────────────────────────────────

  const ADMIN_EMAIL    = 'admin@pubflow.local'
  const ADMIN_PASSWORD = 'Admin@PubFlow2025!'
  const EDITOR_EMAIL   = 'editor@demo-journal.local'
  const EDITOR_PASSWORD = 'Editor@Demo2025!'
  const AUTHOR_EMAIL   = 'author@demo-journal.local'
  const AUTHOR_PASSWORD = 'Author@Demo2025!'
  const REVIEWER_EMAIL   = 'reviewer@demo-journal.local'
  const REVIEWER_PASSWORD = 'Reviewer@Demo2025!'

  // Production-stage roles (copyediting → artwork → typesetting → proofreading)
  const PRODUCTION_USERS = [
    { email: 'copyeditor@demo-journal.local',  password: 'CopyEditor@Demo2025!',  firstName: 'Cora', lastName: 'Copyeditor',  role: 'COPY_EDITOR' },
    { email: 'artwork@demo-journal.local',     password: 'Artwork@Demo2025!',     firstName: 'Ari',  lastName: 'Artworker',   role: 'ARTWORK_EDITOR' },
    { email: 'typesetter@demo-journal.local',  password: 'Typesetter@Demo2025!',  firstName: 'Theo', lastName: 'Typesetter',  role: 'TYPESETTER' },
    { email: 'proofreader@demo-journal.local', password: 'ProofReader@Demo2025!', firstName: 'Pria', lastName: 'Proofreader', role: 'PROOF_READER' },
  ] as const

  // Helper: reliably upsert a seed user regardless of prior DB/Keycloak state.
  // Priority order avoids unique-constraint collisions without deleting rows that
  // may be referenced by existing submissions (FK constraint).
  async function upsertSeedUser(opts: {
    email: string; keycloakId: string | null; tenantId: string
    firstName: string; lastName: string; role: string
  }) {
    if (!opts.keycloakId) {
      console.warn(`⚠️  Keycloak user not created for ${opts.email} — skipping DB upsert`)
      return
    }
    const common = { status: 'ACTIVE' as const, role: opts.role as any, firstName: opts.firstName, lastName: opts.lastName }

    // 1. Prefer the record that already sits on the correct tenant (avoids moving data)
    const onTarget = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: opts.tenantId, email: opts.email } },
    })
    if (onTarget) {
      await prisma.user.update({ where: { id: onTarget.id }, data: { keycloakId: opts.keycloakId, ...common } })
      return
    }

    // 2. Find by the new Keycloak ID — may be on a wrong tenant from auto-provisioning
    const byKcId = await prisma.user.findUnique({ where: { keycloakId: opts.keycloakId } })
    if (byKcId) {
      // Safe: we know no [targetTenant, email] row exists (checked above)
      await prisma.user.update({ where: { id: byKcId.id }, data: { tenantId: opts.tenantId, ...common } })
      return
    }

    // 3. Create fresh — truly new user
    await prisma.user.create({
      data: { keycloakId: opts.keycloakId, tenantId: opts.tenantId, email: opts.email, ...common },
    })
  }

  // Admin user (super-admin on pubflow-admin tenant)
  const adminKcId = await createKeycloakUser(ADMIN_EMAIL, 'PubFlow', 'Admin', ADMIN_PASSWORD)
  await upsertSeedUser({
    email: ADMIN_EMAIL, keycloakId: adminKcId, tenantId: superTenant.id,
    firstName: 'PubFlow', lastName: 'Admin', role: 'SUPER_ADMIN',
  })
  if (adminKcId) console.info(`✅ Admin user:    ${ADMIN_EMAIL}`)

  // Editor-in-Chief on demo-journal tenant
  const editorKcId = await createKeycloakUser(EDITOR_EMAIL, 'Jane', 'Editor', EDITOR_PASSWORD)
  await upsertSeedUser({
    email: EDITOR_EMAIL, keycloakId: editorKcId, tenantId: demoTenant.id,
    firstName: 'Jane', lastName: 'Editor', role: 'EDITOR_IN_CHIEF',
  })
  if (editorKcId) console.info(`✅ Editor user:   ${EDITOR_EMAIL}`)

  // Author on demo-journal tenant
  const authorKcId = await createKeycloakUser(AUTHOR_EMAIL, 'John', 'Author', AUTHOR_PASSWORD)
  await upsertSeedUser({
    email: AUTHOR_EMAIL, keycloakId: authorKcId, tenantId: demoTenant.id,
    firstName: 'John', lastName: 'Author', role: 'AUTHOR',
  })
  if (authorKcId) console.info(`✅ Author user:   ${AUTHOR_EMAIL}`)

  // Peer reviewer on demo-journal tenant — needed to exercise the review workflow
  const reviewerKcId = await createKeycloakUser(REVIEWER_EMAIL, 'Rita', 'Reviewer', REVIEWER_PASSWORD)
  await upsertSeedUser({
    email: REVIEWER_EMAIL, keycloakId: reviewerKcId, tenantId: demoTenant.id,
    firstName: 'Rita', lastName: 'Reviewer', role: 'PEER_REVIEWER',
  })
  if (reviewerKcId) console.info(`✅ Reviewer user: ${REVIEWER_EMAIL}`)

  // Production-stage users on demo-journal tenant
  const productionKcIds: Record<string, string | null> = {}
  for (const p of PRODUCTION_USERS) {
    const kcId = await createKeycloakUser(p.email, p.firstName, p.lastName, p.password)
    productionKcIds[p.email] = kcId
    await upsertSeedUser({
      email: p.email, keycloakId: kcId, tenantId: demoTenant.id,
      firstName: p.firstName, lastName: p.lastName, role: p.role,
    })
    if (kcId) console.info(`✅ ${p.role} user: ${p.email}`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.info('')
  console.info('🌱 Seeding complete!')
  console.info('')
  if (adminKcId || editorKcId || authorKcId) {
    console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.info('  TEST CREDENTIALS')
    console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    if (adminKcId)  console.info(`  Admin   → ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}`)
    if (editorKcId) console.info(`  Editor  → ${EDITOR_EMAIL}  /  ${EDITOR_PASSWORD}`)
    if (authorKcId) console.info(`  Author  → ${AUTHOR_EMAIL}  /  ${AUTHOR_PASSWORD}`)
    if (reviewerKcId) console.info(`  Reviewer→ ${REVIEWER_EMAIL}  /  ${REVIEWER_PASSWORD}`)
    for (const p of PRODUCTION_USERS) {
      if (productionKcIds[p.email]) console.info(`  ${p.role.padEnd(8)}→ ${p.email}  /  ${p.password}`)
    }
    console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.info('  Open: http://localhost:3000')
    console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } else {
    console.info('⚠️  No users were created (Keycloak was not reachable).')
    console.info('   Start Docker services and re-run: pnpm db:seed')
  }
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
