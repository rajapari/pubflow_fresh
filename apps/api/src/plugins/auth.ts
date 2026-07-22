import fp from 'fastify-plugin'
import jwtPlugin from '@fastify/jwt'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthUser } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { seedDefaultCatalog } from '../lib/default-publications.js'

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

  // Fail CLOSED, never open: if Keycloak's public key can't be obtained, do
  // NOT fall back to a fixed/known secret — that would let anyone who reads
  // this source forge an HS256 token and authenticate as any user. Instead
  // configure the JWT plugin with a random, process-local secret that nobody
  // can know or derive, so every verification attempt fails and `authenticate`
  // uniformly returns 401 until the API is restarted with Keycloak reachable.
  const publicKeyUnavailable = !publicKey
  await app.register(jwtPlugin, publicKey
    ? { secret: { public: publicKey }, decode: { complete: true }, verify: { algorithms: ['RS256'] } }
    : { secret: randomBytes(48).toString('hex'), verify: { algorithms: ['HS256'] } }
  )
  if (publicKeyUnavailable) {
    app.log.error('⚠️  Keycloak public key unavailable — auth is running FAIL-CLOSED (every request will be 401) until the API is restarted with Keycloak reachable.')
  }

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

          // Seed the publisher → publication catalogue so the new tenant isn't empty
          await seedDefaultCatalog(prisma, tenant.id)

          app.log.info({ sub, email, role }, '✅ Auto-provisioned new user + seeded catalogue')
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

      // Lazy-seed the publisher → publication catalogue for any tenant that
      // has no publishers yet (also links pre-publisher publications by title).
      // The in-memory set means the COUNT query runs once per tenant per
      // process lifetime instead of on every authenticated request.
      if (!seededTenants.has(dbUser.tenantId)) {
        const publisherCount = await prisma.publisher.count({ where: { tenantId: dbUser.tenantId } })
        if (publisherCount === 0) {
          await seedDefaultCatalog(prisma, dbUser.tenantId)
          app.log.info({ tenantId: dbUser.tenantId }, '✅ Lazy-seeded publisher catalogue for tenant')
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
