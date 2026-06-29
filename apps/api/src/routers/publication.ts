import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, chiefEditorProcedure } from '../trpc/procedures.js'

export const publicationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.publication.findMany({
      where:   { tenantId: ctx.user.tenantId, status: 'ACTIVE' },
      include: { _count: { select: { submissions: true } } },
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

  create: chiefEditorProcedure
    .input(z.object({
      title:       z.string().min(1).max(500),
      type:        z.enum(['JOURNAL', 'BOOK', 'BOOK_SERIES', 'PROCEEDINGS']),
      issn:        z.string().optional(),
      isbn:        z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.publication.create({
        data: { tenantId: ctx.user.tenantId, ...input },
      })
    }),

  archive: chiefEditorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const pub = await ctx.prisma.publication.findFirst({
        where: { id: input.id, tenantId: ctx.user.tenantId },
      })
      if (!pub) throw new TRPCError({ code: 'NOT_FOUND' })
      return ctx.prisma.publication.update({
        where: { id: input.id },
        data:  { status: 'ARCHIVED' },
      })
    }),
})

export const tenantRouter = router({
  current: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.tenant.findUnique({
      where:   { id: ctx.user.tenantId },
      include: { settings: true },
    })
  }),

  updateSettings: chiefEditorProcedure
    .input(z.object({
      primaryColor:          z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      defaultCitationStyle:  z.string().optional(),
      enablePeerReview:      z.boolean().optional(),
      enableDoiRegistration: z.boolean().optional(),
      doiPrefix:             z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.tenantSettings.upsert({
        where:  { tenantId: ctx.user.tenantId },
        update: input,
        create: { tenantId: ctx.user.tenantId, ...input },
      })
    }),
})
