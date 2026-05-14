import { PrismaClient } from '@pubflow/db'
export const prisma: PrismaClient = new PrismaClient({ log: ['warn','error'] })
