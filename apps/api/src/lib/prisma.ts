import { PrismaClient } from '@pubflow/db'

const g = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = g.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
})

if (process.env.NODE_ENV !== 'production') g.prisma = prisma
