import fp from 'fastify-plugin'
import { Redis } from 'ioredis'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance { redis: Redis }
}

export const redisPlugin = fp(async (app: FastifyInstance) => {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/0'

  app.log.info(`Connecting to Redis: ${redisUrl.replace(/:\/\/.*@/, '://***@')}`)

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
    retryStrategy: (times) => {
      if (times > 5) return null // stop retrying after 5 attempts
      return Math.min(times * 1000, 5000)
    },
  })

  redis.on('connect',       ()    => app.log.info('✅ Redis connected'))
  redis.on('ready',         ()    => app.log.info('✅ Redis ready'))
  redis.on('error',         (err) => app.log.error({ err }, 'Redis error'))
  redis.on('reconnecting',  ()    => app.log.warn('Redis reconnecting...'))

  app.decorate('redis', redis)
  app.addHook('onClose', async () => {
    await redis.quit()
    app.log.info('Redis connection closed')
  })
})
