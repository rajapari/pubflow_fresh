import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const checks = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      app.redis.ping(),
    ])
    const pg    = checks[0]?.status === 'fulfilled'
    const redis = checks[1]?.status === 'fulfilled'
    return {
      status: pg && redis ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { postgres: pg ? 'ok' : 'error', redis: redis ? 'ok' : 'error' },
      version: '0.1.0',
    }
  })
}
