// Test caller factory: drives the real appRouter through createCaller with a
// hand-built Context — real Prisma, real MinIO, real BullMQ queues — but a
// fake authenticated user, so role/tenant checks are exercised end-to-end.
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { QUEUES } from '@pubflow/types'
import type { AuthUser, QueueName, UserRole } from '@pubflow/types'
import { prisma } from '../src/lib/prisma.js'
import { appRouter } from '../src/routers/index.js'
import { MinioStorage } from '../src/plugins/minio.js'
import type { Context } from '../src/trpc/context.js'

let minioSingleton: MinioStorage | null = null
let queuesSingleton: Record<QueueName, Queue> | null = null
let redisSingleton: Redis | null = null

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6379/0'
}

export function getQueues(): Record<QueueName, Queue> {
  if (!queuesSingleton) {
    const url = new URL(getRedisUrl())
    const connection = {
      host: url.hostname || 'localhost',
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      db: Number(url.pathname?.replace('/', '') || 0),
    }
    queuesSingleton = Object.fromEntries(
      Object.values(QUEUES).map((name) => [name, new Queue(name, { connection })]),
    ) as Record<QueueName, Queue>
  }
  return queuesSingleton
}

export function getMinio(): MinioStorage {
  if (!minioSingleton) minioSingleton = new MinioStorage()
  return minioSingleton
}

function getRedis(): Redis {
  if (!redisSingleton) {
    redisSingleton = new Redis(getRedisUrl(), { maxRetriesPerRequest: null, lazyConnect: true })
  }
  return redisSingleton
}

export interface TestUser {
  id: string
  tenantId: string
  role: UserRole | 'PROOF_READER' // PROOF_READER exists in DB; typed loosely until auth.ts catches up
  email?: string
}

export function makeCaller(user: TestUser | null) {
  const authUser: AuthUser | null = user
    ? {
        id: user.id,
        tenantId: user.tenantId,
        keycloakId: `test-${user.id}`,
        email: user.email ?? `${user.id}@test.local`,
        firstName: 'Test',
        lastName: 'User',
        orcid: null,
        role: user.role as AuthUser['role'],
      }
    : null

  const ctx: Context = {
    user: authUser,
    prisma,
    minio: getMinio(),
    queues: getQueues(),
    redis: getRedis(),
  }
  return appRouter.createCaller(ctx)
}

export async function closeTestConnections(): Promise<void> {
  if (queuesSingleton) {
    await Promise.all(Object.values(queuesSingleton).map((q) => q.close()))
    queuesSingleton = null
  }
  if (redisSingleton) {
    redisSingleton.disconnect()
    redisSingleton = null
  }
}
