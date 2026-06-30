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

  updateProfile: protectedProcedure
    .input(z.object({
      firstName:   z.string().min(1).max(100).optional(),
      lastName:    z.string().max(100).optional(),
      orcid:       z.string().max(50).optional().nullable(),
      affiliation: z.string().max(200).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where:  { id: ctx.user.id },
        data:   input,
        select: { id:true, email:true, firstName:true, lastName:true,
                  orcid:true, affiliation:true, role:true, createdAt:true },
      })
    }),

  list: protectedProcedure
    .input(z.object({ role: z.enum(['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SECTION_EDITOR', 'COPY_EDITOR', 'ARTWORK_EDITOR', 'TYPESETTER', 'PROOF_READER', 'PEER_REVIEWER', 'AUTHOR', 'READER']).optional() }))
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
