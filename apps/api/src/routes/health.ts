import type { FastifyInstance, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { isKeycloakAuthHealthy } from '../plugins/auth.js'

export async function healthRoutes(app: FastifyInstance) {
  // Liveness: "is the process alive and able to answer HTTP at all" —
  // deliberately checks nothing external. A Keycloak/Postgres/Redis outage
  // must make the pod unready (below), not dead — killing and restarting
  // every API pod because Keycloak is slow would just thrash the cluster
  // without fixing anything, and defeats the point of auth self-healing in
  // the background once Keycloak answers again.
  app.get('/live', async () => ({ status: 'ok' }))

  // Readiness: the full dependency check — this is the one that should gate
  // traffic.
  app.get('/', async (_req, reply: FastifyReply) => {
    const checks = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      app.redis.ping(),
    ])
    const pg       = checks[0]?.status === 'fulfilled'
    const redis    = checks[1]?.status === 'fulfilled'
    const keycloak = isKeycloakAuthHealthy()
    const ok = pg && redis && keycloak

    // A 200 regardless of `status` meant Kubernetes's readiness probe (just
    // an HTTP GET — it never reads the body) could never actually detect a
    // degraded pod, Keycloak-auth-down included: this previously reported
    // "degraded" in the body while still answering 200, so the probe kept
    // routing traffic to a pod that would 401 every request. 503 here is
    // what makes the probe — and thus Kubernetes — actually act on it.
    reply.code(ok ? 200 : 503)
    return {
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        postgres: pg ? 'ok' : 'error',
        redis: redis ? 'ok' : 'error',
        keycloak: keycloak ? 'ok' : 'error',
      },
      version: '0.1.0',
    }
  })
}
