import { PrismaClient } from '../generated/client/index.js'

const prisma = new PrismaClient()

async function main() {
  console.info('🌱 Seeding database...')

  const superTenant = await prisma.tenant.upsert({
    where: { slug: 'pubflow-admin' },
    update: {},
    create: {
      name: 'PubFlow Administration',
      slug: 'pubflow-admin',
      plan: 'ENTERPRISE',
      settings: { create: { primaryColor: '#534AB7' } },
    },
  })
  console.info(`✅ Super tenant: ${superTenant.slug}`)

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo-journal' },
    update: {},
    create: {
      name: 'Demo Journal of Science',
      slug: 'demo-journal',
      plan: 'PROFESSIONAL',
      settings: {
        create: {
          primaryColor: '#0F6E56',
          defaultCitationStyle: 'vancouver',
          enablePeerReview: true,
          enableDoiRegistration: true,
          doiPrefix: '10.99999',
        },
      },
    },
  })
  console.info(`✅ Demo tenant: ${demoTenant.slug}`)

  await prisma.publication.upsert({
    where: { id: 'demo-pub-001' },
    update: {},
    create: {
      id: 'demo-pub-001',
      tenantId: demoTenant.id,
      title: 'Demo Journal of Science',
      type: 'JOURNAL',
      issn: '0000-0000',
      description: 'A demonstration journal for PubFlow platform testing.',
    },
  })
  console.info('✅ Demo publication created')
  console.info('🌱 Seeding complete!')
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
