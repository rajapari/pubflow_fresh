import fp from 'fastify-plugin'
import jwtPlugin from '@fastify/jwt'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthUser } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'

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
    const res  = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { public_key?: string }
    if (!data.public_key) throw new Error('No public_key')
    logger.info('✅ Keycloak public key loaded')
    return `-----BEGIN PUBLIC KEY-----\n${data.public_key}\n-----END PUBLIC KEY-----`
  } catch (err) {
    logger.warn(`⚠️  Keycloak unavailable — API starts without auth. ${err instanceof Error ? err.message : ''}`)
    return null
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  const publicKey = await fetchPublicKey(app.log)

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

      const dbUser = await prisma.user.findUnique({
        where:  { keycloakId: sub },
        select: { id: true, tenantId: true, keycloakId: true, email: true,
                  firstName: true, lastName: true, orcid: true, role: true, status: true },
      })
      if (!dbUser || dbUser.status !== 'ACTIVE') throw new Error('User inactive')

      req.user = dbUser as AuthUser
    } catch {
      throw app.httpErrors.unauthorized('Unauthorized')
    }
  })

  app.decorate('optionalAuth', async (req: FastifyRequest) => {
    try { await app.authenticate(req) } catch { /* public */ }
  })

  app.log.info('✅ Auth plugin ready')
}, { name: 'auth' })
