import { PrismaClient } from '../generated/client/index.js'

const prisma = new PrismaClient()

// Well-known active publications available to all tenants during the testing phase.
// Keep in sync with apps/api/src/lib/default-publications.ts
const DEFAULT_PUBLICATIONS = [
  { title: 'Nature',                          type: 'JOURNAL', issn: '0028-0836', description: 'International weekly journal of science — Springer Nature.' },
  { title: 'Science',                          type: 'JOURNAL', issn: '0036-8075', description: 'Peer-reviewed journal of the American Association for the Advancement of Science (AAAS).' },
  { title: 'PNAS – Proceedings of the National Academy of Sciences', type: 'JOURNAL', issn: '0027-8424', description: 'Multidisciplinary scientific research — National Academy of Sciences, USA.' },
  { title: 'Scientific Reports',               type: 'JOURNAL', issn: '2045-2322', description: 'Open-access multidisciplinary journal — Nature Portfolio.' },
  { title: 'Nature Communications',            type: 'JOURNAL', issn: '2041-1723', description: 'Open-access multidisciplinary journal covering all areas of natural sciences — Nature Portfolio.' },
  { title: 'PLOS ONE',                         type: 'JOURNAL', issn: '1932-6203', description: 'Inclusive open-access journal across science and medicine — Public Library of Science.' },
  { title: 'eLife',                            type: 'JOURNAL', issn: '2050-084X', description: 'Open-access journal for outstanding research in the life sciences and biomedicine.' },
  { title: 'Royal Society Open Science',       type: 'JOURNAL', issn: '2054-5703', description: 'Open-access journal covering all of science — The Royal Society.' },
  { title: 'The New England Journal of Medicine', type: 'JOURNAL', issn: '0028-4793', description: 'Leading peer-reviewed medical journal — Massachusetts Medical Society.' },
  { title: 'The Lancet',                          type: 'JOURNAL', issn: '0140-6736', description: 'International general medical journal — Elsevier.' },
  { title: 'JAMA – Journal of the American Medical Association', type: 'JOURNAL', issn: '0098-7484', description: 'Peer-reviewed general medical journal — American Medical Association.' },
  { title: 'BMJ – British Medical Journal',       type: 'JOURNAL', issn: '0959-8138', description: 'International peer-reviewed medical journal — BMJ Publishing Group.' },
  { title: 'PLOS Medicine',                       type: 'JOURNAL', issn: '1549-1676', description: 'Open-access journal for research in the health sciences — Public Library of Science.' },
  { title: 'BMC Medicine',                        type: 'JOURNAL', issn: '1741-7015', description: 'Open-access, general medical journal — BioMed Central / Springer Nature.' },
  { title: 'Frontiers in Medicine',               type: 'JOURNAL', issn: '2296-858X', description: 'Open-access journal covering clinical medicine and translational research — Frontiers.' },
  { title: 'Journal of Clinical Investigation',   type: 'JOURNAL', issn: '0021-9738', description: 'Basic and clinical biomedical research — American Society for Clinical Investigation.' },
  { title: 'Annals of Internal Medicine',         type: 'JOURNAL', issn: '0003-4819', description: 'Clinical and research articles in internal medicine — American College of Physicians.' },
  { title: 'Cell',                              type: 'JOURNAL', issn: '0092-8674', description: 'Cutting-edge research across the life sciences — Elsevier / Cell Press.' },
  { title: 'Nature Cell Biology',               type: 'JOURNAL', issn: '1465-7392', description: 'Cell biology research — Nature Portfolio.' },
  { title: 'PLOS Biology',                      type: 'JOURNAL', issn: '1544-9173', description: 'Open-access biological sciences journal — Public Library of Science.' },
  { title: 'PLOS Genetics',                     type: 'JOURNAL', issn: '1553-7390', description: 'Open-access genetics and genomics journal — Public Library of Science.' },
  { title: 'Genome Biology',                    type: 'JOURNAL', issn: '1474-760X', description: 'Open-access genomics research — BioMed Central / Springer Nature.' },
  { title: 'Molecular Cell',                    type: 'JOURNAL', issn: '1097-2765', description: 'Molecular biology and biochemistry — Cell Press / Elsevier.' },
  { title: 'Nature Neuroscience',               type: 'JOURNAL', issn: '1097-6256', description: 'Neuroscience research — Nature Portfolio.' },
  { title: 'Neuron',                            type: 'JOURNAL', issn: '0896-6273', description: 'Cellular and molecular neuroscience — Cell Press / Elsevier.' },
  { title: 'Frontiers in Neuroscience',         type: 'JOURNAL', issn: '1662-453X', description: 'Open-access neuroscience journal — Frontiers.' },
  { title: 'Psychological Science',             type: 'JOURNAL', issn: '0956-7976', description: 'Empirical research in psychology — Association for Psychological Science / SAGE.' },
  { title: 'Frontiers in Psychology',           type: 'JOURNAL', issn: '1664-1078', description: 'Open-access psychology journal — Frontiers.' },
  { title: 'Physical Review Letters',           type: 'JOURNAL', issn: '0031-9007', description: 'Letters on physics — American Physical Society.' },
  { title: 'Nature Physics',                    type: 'JOURNAL', issn: '1745-2473', description: 'Physics research — Nature Portfolio.' },
  { title: 'Journal of the American Chemical Society', type: 'JOURNAL', issn: '0002-7863', description: 'Chemistry — American Chemical Society.' },
  { title: 'Angewandte Chemie International Edition', type: 'JOURNAL', issn: '1433-7851', description: 'International journal of chemistry — Wiley-VCH / German Chemical Society.' },
  { title: 'ACS Nano',                          type: 'JOURNAL', issn: '1936-0851', description: 'Nanoscience and nanotechnology — American Chemical Society.' },
  { title: 'Nature Machine Intelligence',       type: 'JOURNAL', issn: '2522-5839', description: 'AI, machine learning, and intelligent systems — Nature Portfolio.' },
  { title: 'IEEE Transactions on Pattern Analysis and Machine Intelligence', type: 'JOURNAL', issn: '0162-8828', description: 'Computer vision and machine learning — IEEE Computer Society.' },
  { title: 'Journal of Machine Learning Research', type: 'JOURNAL', issn: '1533-7928', description: 'Open-access machine learning research — MIT Press.' },
  { title: 'ACM Computing Surveys',             type: 'JOURNAL', issn: '0360-0300', description: 'Comprehensive surveys in computing — ACM.' },
  { title: 'Communications of the ACM',         type: 'JOURNAL', issn: '0001-0782', description: 'Computing research and practice — ACM.' },
  { title: 'American Economic Review',          type: 'JOURNAL', issn: '0002-8282', description: 'Economics — American Economic Association.' },
  { title: 'Science Advances',                  type: 'JOURNAL', issn: '2375-2548', description: 'Open-access multidisciplinary journal — AAAS.' },
  { title: 'PLOS Computational Biology',        type: 'JOURNAL', issn: '1553-7358', description: 'Computational biology — Public Library of Science.' },
  { title: 'Nature Climate Change',             type: 'JOURNAL', issn: '1758-678X', description: 'Climate change research and impacts — Nature Portfolio.' },
  { title: 'Global Change Biology',             type: 'JOURNAL', issn: '1354-1013', description: 'Ecology and global change — Wiley.' },
  { title: 'Environmental Science & Technology', type: 'JOURNAL', issn: '0013-936X', description: 'Environmental science and engineering — American Chemical Society.' },
  { title: 'Oxford University Press – Monographs', type: 'BOOK', description: 'Academic book submissions — Oxford University Press.' },
  { title: 'Springer Nature – Books',              type: 'BOOK', description: 'Academic and professional books — Springer Nature.' },
  { title: 'MIT Press – Books',                    type: 'BOOK', description: 'Academic books in science, technology, and the arts — MIT Press.' },
] as const

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
        `${KC_URL}/admin/realms/${KC_REALM}/users?email=${encodeURIComponent(email)}`,
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

  // Publication for the admin tenant so the admin user can test submissions
  await prisma.publication.upsert({
    where:  { id: 'b0000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id:          'b0000000-0000-0000-0000-000000000001',
      tenantId:    superTenant.id,
      title:       'PubFlow Internal Journal',
      type:        'JOURNAL',
      description: 'Internal test journal for PubFlow administration.',
    },
  })
  console.info(`✅ Admin publication: PubFlow Internal Journal`)

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

  // Seed the full catalogue into both tenants so every user sees a populated dropdown.
  const pubData = (tenantId: string) =>
    DEFAULT_PUBLICATIONS.map(p => ({
      tenantId,
      title:       p.title,
      type:        p.type as 'JOURNAL' | 'BOOK',
      issn:        'issn' in p ? (p.issn || undefined) : undefined,
      isbn:        'isbn' in p ? ((p as any).isbn || undefined) : undefined,
      description: p.description,
      status:      'ACTIVE' as const,
    }))

  const [demoCount, adminCount] = await Promise.all([
    prisma.publication.createMany({ data: pubData(demoTenant.id),  skipDuplicates: true }),
    prisma.publication.createMany({ data: pubData(superTenant.id), skipDuplicates: true }),
  ])
  console.info(`✅ Seeded ${demoCount.count} publications → demo tenant`)
  console.info(`✅ Seeded ${adminCount.count} publications → admin tenant`)

  // ── Users ────────────────────────────────────────────────────────────────

  const ADMIN_EMAIL    = 'admin@pubflow.local'
  const ADMIN_PASSWORD = 'Admin@PubFlow2025!'
  const EDITOR_EMAIL   = 'editor@demo-journal.local'
  const EDITOR_PASSWORD = 'Editor@Demo2025!'
  const AUTHOR_EMAIL   = 'author@demo-journal.local'
  const AUTHOR_PASSWORD = 'Author@Demo2025!'

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
