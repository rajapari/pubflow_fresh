import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, adminProcedure } from '../trpc/procedures.js'

export const publicationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.publication.findMany({
      where:   { tenantId: ctx.user.tenantId, status: 'ACTIVE' },
      orderBy: { title: 'asc' },
    })
  }),
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const pub = await ctx.prisma.publication.findFirst({
        where: { id: input.id, tenantId: ctx.user.tenantId },
        include: { _count: { select: { submissions: true } } },
      })
      if (!pub) throw new TRPCError({ code: 'NOT_FOUND' })
      return pub
    }),
})

export const tenantRouter = router({
  current: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.tenant.findUnique({
      where:   { id: ctx.user.tenantId },
      include: { settings: true },
    })
  }),
})
