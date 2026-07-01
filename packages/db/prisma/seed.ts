import { PrismaClient } from '../generated/client/index.js'

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
      // User already exists — fetch their ID instead
      const searchRes = await fetch(
        `${KC_URL}/admin/realms/${KC_REALM}/users?email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      )
      const users = await searchRes.json() as Array<{ id: string }>
      if (users.length > 0) return users[0].id
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

  // ── Publication ──────────────────────────────────────────────────────────

  const demoPub = await prisma.publication.upsert({
    where:  { id: 'a0000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id:          'a0000000-0000-0000-0000-000000000001',
      tenantId:    demoTenant.id,
      title:       'Demo Journal of Science',
      type:        'JOURNAL',
      issn:        '0000-0000',
      description: 'A demonstration journal for PubFlow platform testing.',
    },
  })
  console.info(`✅ Demo publication: ${demoPub.title}`)

  // ── Users ────────────────────────────────────────────────────────────────

  const ADMIN_EMAIL    = 'admin@pubflow.local'
  const ADMIN_PASSWORD = 'Admin@PubFlow2025!'
  const EDITOR_EMAIL   = 'editor@demo-journal.local'
  const EDITOR_PASSWORD = 'Editor@Demo2025!'
  const AUTHOR_EMAIL   = 'author@demo-journal.local'
  const AUTHOR_PASSWORD = 'Author@Demo2025!'

  // Admin user (super-admin on pubflow-admin tenant)
  const adminKcId = await createKeycloakUser(ADMIN_EMAIL, 'PubFlow', 'Admin', ADMIN_PASSWORD)
  if (adminKcId) {
    await prisma.user.upsert({
      where:  { keycloakId: adminKcId },
      update: {},
      create: {
        keycloakId: adminKcId,
        tenantId:   superTenant.id,
        email:      ADMIN_EMAIL,
        firstName:  'PubFlow',
        lastName:   'Admin',
        role:       'SUPER_ADMIN',
        status:     'ACTIVE',
      },
    })
    console.info(`✅ Admin user:    ${ADMIN_EMAIL}`)
  }

  // Editor-in-Chief on demo-journal tenant
  const editorKcId = await createKeycloakUser(EDITOR_EMAIL, 'Jane', 'Editor', EDITOR_PASSWORD)
  if (editorKcId) {
    await prisma.user.upsert({
      where:  { keycloakId: editorKcId },
      update: {},
      create: {
        keycloakId: editorKcId,
        tenantId:   demoTenant.id,
        email:      EDITOR_EMAIL,
        firstName:  'Jane',
        lastName:   'Editor',
        role:       'EDITOR_IN_CHIEF',
        status:     'ACTIVE',
      },
    })
    console.info(`✅ Editor user:   ${EDITOR_EMAIL}`)
  }

  // Author on demo-journal tenant
  const authorKcId = await createKeycloakUser(AUTHOR_EMAIL, 'John', 'Author', AUTHOR_PASSWORD)
  if (authorKcId) {
    await prisma.user.upsert({
      where:  { keycloakId: authorKcId },
      update: {},
      create: {
        keycloakId: authorKcId,
        tenantId:   demoTenant.id,
        email:      AUTHOR_EMAIL,
        firstName:  'John',
        lastName:   'Author',
        role:       'AUTHOR',
        status:     'ACTIVE',
      },
    })
    console.info(`✅ Author user:   ${AUTHOR_EMAIL}`)
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
