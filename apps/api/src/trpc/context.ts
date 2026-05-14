// src/trpc/context.ts
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@pubflow/db'
import { prisma } from '../lib/prisma.js'
import type { AuthUser } from '@pubflow/types'

export interface Context {
  user: AuthUser | null
  prisma: PrismaClient
  minio: FastifyInstance['minio']
  queues: FastifyInstance['queues']
  redis: FastifyInstance['redis']
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
  return { user, prisma, minio: app.minio, queues: app.queues, redis: app.redis }
}
