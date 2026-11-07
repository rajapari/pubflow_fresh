import fp from 'fastify-plugin'
import jwtPlugin from '@fastify/jwt'
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

// Module-level: fetched once Keycloak answers, then read fresh on every
// verification by the async key fetcher registered below. This is what
// lets auth self-heal if Keycloak was still booting when the API started —
// a real scenario (Keycloak is typically the slowest thing to come up,
// both in `docker compose up` and on a cluster's first deploy) — without
// needing the API restarted once Keycloak finally answers.
let currentPublicKey: string | null = null

/** For the /health route — a 401-everything auth state is a real outage. */
export function isKeycloakAuthHealthy(): boolean {
  return currentPublicKey !== null
}

async function fetchPublicKey(logger: FastifyInstance['log']): Promise<string | null> {
  const url = `${process.env.KEYCLOAK_URL ?? 'http://localhost:8080'}/realms/${process.env.KEYCLOAK_REALM ?? 'pubflow'}`
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { public_key?: string }
    if (!data.public_key) throw new Error('No public_key')
    return `-----BEGIN PUBLIC KEY-----\n${data.public_key}\n-----END PUBLIC KEY-----`
  } catch (err) {
    logger.warn(`⚠️  Keycloak unavailable: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

const BACKGROUND_RETRY_MS = 10_000

// Keeps trying forever, in the background, once the startup burst below
// gives up — this is the self-healing half of the fix. Every request still
// 401s (fail-closed, never an insecure fallback) until one of these succeeds.
function retryInBackground(logger: FastifyInstance['log']): void {
  const timer = setTimeout(() => {
    void fetchPublicKey(logger).then((key) => {
      if (key) {
        currentPublicKey = key
        logger.info('✅ Keycloak public key recovered — auth is live again, no restart needed')
        return
      }
      retryInBackground(logger)
    })
  }, BACKGROUND_RETRY_MS)
  // Never block process exit on this (tests, graceful shutdown) — it's a
  // best-effort background retry, not something anything waits on.
  timer.unref()
}

// Retry up to 4 times with a 2 s back-off so the API starts correctly even
// when Keycloak is still booting alongside it (common in `docker compose up`).
// If that burst isn't enough, hand off to the indefinite background retry
// above instead of giving up — see retryInBackground's comment.
async function establishPublicKey(logger: FastifyInstance['log']): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const key = await fetchPublicKey(logger)
    if (key) {
      currentPublicKey = key
      logger.info('✅ Keycloak public key loaded')
      return
    }
    if (attempt < 4) {
      logger.info(`Waiting for Keycloak… retry ${attempt}/3 in 2 s`)
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  logger.error('⚠️  Could not reach Keycloak after 4 attempts — auth is running FAIL-CLOSED (every request will be 401). Retrying in the background every 10s; no restart needed once Keycloak answers.')
  retryInBackground(logger)
}

// Tenants confirmed to have publications — lets us skip the lazy-seed COUNT
// query on every authenticated request after the first one per tenant.
const seededTenants = new Set<string>()

export const authPlugin = fp(async (app: FastifyInstance) => {
  await establishPublicKey(app.log)

  // Fail CLOSED, never open: the key is read fresh on every verification via
  // this async fetcher (fast-jwt's KeyFetcher form) instead of being baked
  // into the plugin config once at registration time — so a Keycloak outage
  // (at startup or later) simply makes verification throw (401, same as a
  // bad signature), with no separate "no key yet" branch and no insecure
  // fallback secret to maintain.
  await app.register(jwtPlugin, {
    secret: {
      public: async () => {
        if (!currentPublicKey) throw new Error('Keycloak public key unavailable')
        return currentPublicKey
      },
    },
    decode: { complete: true },
    verify: { algorithms: ['RS256'] },
  })

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
