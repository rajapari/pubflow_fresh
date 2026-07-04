import fp from 'fastify-plugin'
import jwtPlugin from '@fastify/jwt'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthUser } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { DEFAULT_PUBLICATIONS } from '../lib/default-publications.js'

// Extend @fastify/jwt namespace to accept our user shape
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUser
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>
    optionalAuth:  (req: FastifyRequest) => Promise<void>
  }
}

async function fetchPublicKey(logger: FastifyInstance['log']): Promise<string | null> {
  const url = `${process.env.KEYCLOAK_URL ?? 'http://localhost:8080'}/realms/${process.env.KEYCLOAK_REALM ?? 'pubflow'}`
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { public_key?: string }
    if (!data.public_key) throw new Error('No public_key')
    logger.info('✅ Keycloak public key loaded')
    return `-----BEGIN PUBLIC KEY-----\n${data.public_key}\n-----END PUBLIC KEY-----`
  } catch (err) {
    logger.warn(`⚠️  Keycloak unavailable: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

// Retry up to 4 times with a 2 s back-off so the API starts correctly even
// when Keycloak is still booting alongside it (common in `docker compose up`).
async function fetchPublicKeyWithRetry(logger: FastifyInstance['log']): Promise<string | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const key = await fetchPublicKey(logger)
    if (key) return key
    if (attempt < 4) {
      logger.info(`Waiting for Keycloak… retry ${attempt}/3 in 2 s`)
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  logger.warn('⚠️  Could not reach Keycloak after 4 attempts — JWT verification disabled (dev mode). Restart the API once Keycloak is up.')
  return null
}

// Tenants confirmed to have publications — lets us skip the lazy-seed COUNT
// query on every authenticated request after the first one per tenant.
const seededTenants = new Set<string>()

export const authPlugin = fp(async (app: FastifyInstance) => {
  const publicKey = await fetchPublicKeyWithRetry(app.log)

  await app.register(jwtPlugin, publicKey
    ? { secret: { public: publicKey }, decode: { complete: true }, verify: { algorithms: ['RS256'] } }
    : { secret: 'pubflow-dev-placeholder' }
  )

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify()
      const payload = req.user as Record<string, unknown>
      const sub     = payload['sub'] as string | undefined
      if (!sub) throw new Error('No sub in token')

      let dbUser = await prisma.user.findUnique({
        where:  { keycloakId: sub },
        select: { id: true, tenantId: true, keycloakId: true, email: true,
                  firstName: true, lastName: true, orcid: true, role: true, status: true },
      })

      // Auto-provision: first time a valid Keycloak user hits the API
      if (!dbUser) {
        const email     = payload['email']       as string | undefined
        const firstName = payload['given_name']  as string | undefined
        const lastName  = payload['family_name'] as string | undefined

        if (!email) throw new Error('Token missing email claim')

        // Derive role from realm_access or default to AUTHOR
        const realmRoles = (payload['realm_access'] as { roles?: string[] } | undefined)?.roles ?? []
        const ROLE_PRIORITY = ['SUPER_ADMIN','EDITOR_IN_CHIEF','SECTION_EDITOR','COPY_EDITOR',
          'ARTWORK_EDITOR','TYPESETTER','PEER_REVIEWER','AUTHOR','READER']
        const role = ROLE_PRIORITY.find(r => realmRoles.includes(r)) ?? 'AUTHOR'

        // Check if a DB user already exists for this email (keycloakId may have changed
        // after a Keycloak reset, or user was created via the register flow).
        // If found, re-link the keycloakId and activate the account.
        const existingByEmail = await prisma.user.findFirst({
          where: { email },
          select: { id: true, tenantId: true, keycloakId: true, email: true,
                    firstName: true, lastName: true, orcid: true, role: true, status: true },
        })

        if (existingByEmail) {
          dbUser = await prisma.user.update({
            where: { id: existingByEmail.id },
            data:  { keycloakId: sub, status: 'ACTIVE' },
            select: { id: true, tenantId: true, keycloakId: true, email: true,
                      firstName: true, lastName: true, orcid: true, role: true, status: true },
          })
          app.log.info({ sub, email }, '✅ Re-linked Keycloak ID for existing user')
        } else {
          // Truly new user — create a personal tenant and seed publications
          const slugBase = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
          const slug     = `${slugBase}-${sub.slice(0, 8)}`

          const tenant = await prisma.tenant.upsert({
            where:  { slug },
            update: {},
            create: {
              name:   email.split('@')[0],
              slug,
              plan:   'STARTER',
              status: 'ACTIVE',
            },
          })

          dbUser = await prisma.user.create({
            data: {
              keycloakId: sub,
              tenantId:   tenant.id,
              email,
              firstName:  firstName ?? null,
              lastName:   lastName  ?? null,
              role:       role as any,
              status:     'ACTIVE',
            },
            select: { id: true, tenantId: true, keycloakId: true, email: true,
                      firstName: true, lastName: true, orcid: true, role: true, status: true },
          })

          // Seed the publications catalogue so the new tenant isn't empty
          await prisma.publication.createMany({
            data: DEFAULT_PUBLICATIONS.map(p => ({
              tenantId:    tenant.id,
              title:       p.title,
              type:        p.type as any,
              issn:        'issn' in p ? (p.issn || undefined) : undefined,
              isbn:        'isbn' in p ? ((p as any).isbn || undefined) : undefined,
              description: p.description,
              status:      'ACTIVE',
            })),
            skipDuplicates: true,
          })

          app.log.info({ sub, email, role }, '✅ Auto-provisioned new user + seeded publications')
        }
      }

      // Activate INVITED users on first successful Keycloak login
      if (dbUser.status === 'INVITED') {
        dbUser = await prisma.user.update({
          where:  { id: dbUser.id },
          data:   { status: 'ACTIVE' },
          select: { id: true, tenantId: true, keycloakId: true, email: true,
                    firstName: true, lastName: true, orcid: true, role: true, status: true },
        })
        app.log.info({ id: dbUser.id }, '✅ Activated INVITED user on first login')
      }

      if (dbUser.status !== 'ACTIVE') throw new Error('User suspended')

      // Lazy-seed publications for any tenant that currently has none.
      // The in-memory set means the COUNT query runs once per tenant per
      // process lifetime instead of on every authenticated request.
      if (!seededTenants.has(dbUser.tenantId)) {
        const pubCount = await prisma.publication.count({ where: { tenantId: dbUser.tenantId } })
        if (pubCount === 0) {
          await prisma.publication.createMany({
            data: DEFAULT_PUBLICATIONS.map(p => ({
              tenantId:    dbUser!.tenantId,
              title:       p.title,
              type:        p.type as any,
              issn:        'issn' in p ? (p.issn || undefined) : undefined,
              isbn:        'isbn' in p ? ((p as any).isbn || undefined) : undefined,
              description: p.description,
              status:      'ACTIVE',
            })),
            skipDuplicates: true,
          })
          app.log.info({ tenantId: dbUser.tenantId }, '✅ Lazy-seeded publications for tenant')
        }
        seededTenants.add(dbUser.tenantId)
      }

      req.user = dbUser as AuthUser
    } catch {
      throw (app as any).httpErrors.unauthorized('Unauthorized')
    }
  })

  app.decorate('optionalAuth', async (req: FastifyRequest) => {
    try { await app.authenticate(req) } catch { /* public */ }
  })

  app.log.info('✅ Auth plugin ready')
}, { name: 'auth' })
