import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import sensible from '@fastify/sensible'
import { authPlugin } from './plugins/auth.js'
import { minioPlugin } from './plugins/minio.js'
import { redisPlugin } from './plugins/redis.js'
import { bullPlugin } from './plugins/bull.js'
import { trpcPlugin } from './plugins/trpc.js'
import { healthRoutes } from './routes/health.js'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'
const IS_DEV = process.env.NODE_ENV !== 'production'

export async function buildServer() {
  const app = Fastify({
    // Use simple logger — no pino-pretty transport needed
    pluginTimeout: 60000,
    logger: {
      level: IS_DEV ? 'info' : 'warn',
      // Only use pino-pretty if the package is available
      ...(IS_DEV ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, ignore: 'pid,hostname' },
        }
      } : {})
    },
    trustProxy: true,
  })

  // Register sensible (adds httpErrors used in auth plugin)
  await app.register(sensible)

  // Security
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: process.env.APP_URL ?? 'http://localhost:3000',
    credentials: true,
  })
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
  await app.register(multipart, {
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  })

  // Core plugins
  await app.register(redisPlugin)
  await app.register(minioPlugin)
  await app.register(bullPlugin)
  await app.register(authPlugin)

  // Routes
  await app.register(healthRoutes, { prefix: '/health' })
  await app.register(trpcPlugin, { prefix: '/trpc' })

  return app
}

async function start() {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined

  try {
    app = await buildServer()
    await app.listen({ port: PORT, host: HOST })
    console.info(`✅ PubFlow API running → http://localhost:${PORT}`)
    console.info(`   Health check → http://localhost:${PORT}/health`)
  } catch (err) {
    console.error('❌ Failed to start API server:', err)
    process.exit(1)
  }
}

start()
