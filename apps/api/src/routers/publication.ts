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

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findUnique({
      where:  { id: ctx.user.id },
      select: { id:true, email:true, firstName:true, lastName:true,
                orcid:true, affiliation:true, role:true, createdAt:true },
    })
  }),
  list: protectedProcedure
    .input(z.object({ role: z.enum(['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SECTION_EDITOR', 'COPY_EDITOR', 'ARTWORK_EDITOR', 'TYPESETTER', 'PEER_REVIEWER', 'AUTHOR', 'READER']).optional() }))
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { tenantId: ctx.user.tenantId, status: 'ACTIVE' }
      if (input.role) where['role'] = input.role

      return ctx.prisma.user.findMany({
        where,
        select: { id:true, email:true, firstName:true, lastName:true, role:true },
        orderBy: { firstName: 'asc' },
      })
    }),
})
