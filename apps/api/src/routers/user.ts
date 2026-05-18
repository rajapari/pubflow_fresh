import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/procedures.js'

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
