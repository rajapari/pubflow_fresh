import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, editorProcedure } from '../trpc/procedures.js'

const StyleManualEnum = z.enum([
  'INHOUSE','APA7','CHICAGO17','AMA11','MLA9','VANCOUVER','IEEE','CSE','HARVARD',
])

// CRUD for pluggable copyediting style profiles. A profile pairs a publisher
// style manual (APA/Chicago/AMA/…) with a CSL citation style and optional
// in-house overlay rules; publications pick a default profile.
export const styleProfileRouter = router({
  list: protectedProcedure
    .input(z.object({ publicationId: z.string().uuid().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.styleProfile.findMany({
        where: {
          tenantId: ctx.user.tenantId,
          ...(input.publicationId
            ? { OR: [{ publicationId: input.publicationId }, { publicationId: null }] }
            : {}),
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      })
    }),

  create: editorProcedure
    .input(z.object({
      name:          z.string().min(2).max(100),
      manual:        StyleManualEnum.default('INHOUSE'),
      cslStyle:      z.string().min(1).max(100).default('apa'),
      houseRules:    z.array(z.string().min(3).max(500)).max(50).default([]),
      publicationId: z.string().uuid().optional(),
      isDefault:     z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      if (input.publicationId) {
        const pub = await prisma.publication.findFirst({
          where: { id: input.publicationId, tenantId: user.tenantId },
        })
        if (!pub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Publication not found' })
      }

      return prisma.$transaction(async (tx) => {
        // Only one default per scope (publication or tenant-wide).
        if (input.isDefault) {
          await tx.styleProfile.updateMany({
            where: { tenantId: user.tenantId, publicationId: input.publicationId ?? null },
            data:  { isDefault: false },
          })
        }
        return tx.styleProfile.create({
          data: {
            tenantId:      user.tenantId,
            publicationId: input.publicationId,
            name:          input.name,
            manual:        input.manual,
            cslStyle:      input.cslStyle,
            houseRules:    input.houseRules,
            isDefault:     input.isDefault,
          },
        })
      })
    }),

  update: editorProcedure
    .input(z.object({
      id:         z.string().uuid(),
      name:       z.string().min(2).max(100).optional(),
      manual:     StyleManualEnum.optional(),
      cslStyle:   z.string().min(1).max(100).optional(),
      houseRules: z.array(z.string().min(3).max(500)).max(50).optional(),
      isDefault:  z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const existing = await prisma.styleProfile.findFirst({
        where: { id: input.id, tenantId: user.tenantId },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

      return prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.styleProfile.updateMany({
            where: { tenantId: user.tenantId, publicationId: existing.publicationId, id: { not: input.id } },
            data:  { isDefault: false },
          })
        }
        return tx.styleProfile.update({
          where: { id: input.id },
          data: {
            ...(input.name       !== undefined ? { name: input.name } : {}),
            ...(input.manual     !== undefined ? { manual: input.manual } : {}),
            ...(input.cslStyle   !== undefined ? { cslStyle: input.cslStyle } : {}),
            ...(input.houseRules !== undefined ? { houseRules: input.houseRules } : {}),
            ...(input.isDefault  !== undefined ? { isDefault: input.isDefault } : {}),
          },
        })
      })
    }),

  delete: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const existing = await prisma.styleProfile.findFirst({
        where: { id: input.id, tenantId: user.tenantId },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      await prisma.styleProfile.delete({ where: { id: input.id } })
      return { success: true }
    }),
})
