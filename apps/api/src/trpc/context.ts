// src/trpc/context.ts
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@pubflow/db'
import { prisma } from '../lib/prisma.js'
import type { AuthUser, QueueName } from '@pubflow/types'
import type { MinioStorage } from '../plugins/minio.js'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
// Import auth plugin to ensure module augmentations are available
import '../plugins/auth.js'

export interface Context {
  user: AuthUser | null
  prisma: PrismaClient
  minio: MinioStorage
  queues: Record<QueueName, Queue>
  redis: Redis
}

export async function createContext(
  { req }: CreateFastifyContextOptions,
  app: FastifyInstance
): Promise<Context> {
  let user: AuthUser | null = null
  try {
    await app.optionalAuth(req)
    user = (req as unknown as { user: AuthUser }).user ?? null
  } catch { /* unauthenticated */ }
  const anyApp = app as any
  return { user, prisma, minio: anyApp.minio, queues: anyApp.queues, redis: anyApp.redis }
}
