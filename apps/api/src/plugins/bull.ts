import fp from 'fastify-plugin'
import { Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { QUEUES } from '@pubflow/types'
import type { QueueName } from '@pubflow/types'

declare module 'fastify' {
  interface FastifyInstance { queues: Record<QueueName, Queue> }
}

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url)
    return {
      host:     parsed.hostname || 'localhost',
      port:     Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      db:       Number(parsed.pathname?.replace('/', '') || 0),
    }
  } catch {
    return { host: 'localhost', port: 6379, password: undefined, db: 0 }
  }
}

export const bullPlugin = fp(async (app: FastifyInstance) => {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/0'
  const connection = parseRedisUrl(redisUrl)

  app.log.info(`BullMQ connecting to Redis: ${connection.host}:${connection.port}`)

  const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 500 },
  }

  const queues = Object.fromEntries(
    Object.values(QUEUES).map((name) => [
      name,
      new Queue(name, { connection, defaultJobOptions }),
    ])
  ) as Record<QueueName, Queue>

  app.decorate('queues', queues)
  app.log.info(`✅ BullMQ queues ready: ${Object.keys(queues).join(', ')}`)

  app.addHook('onClose', async () => {
    await Promise.all(Object.values(queues).map((q) => q.close()))
  })
})
