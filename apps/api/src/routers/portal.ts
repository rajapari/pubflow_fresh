import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/procedures.js'

export const portalRouter = router({
  journal: publicProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const tenant = await ctx.prisma.tenant.findUnique({
        where:   { slug: input.tenantSlug },
        include: {
          publications: {
            where:   { status: 'ACTIVE' },
            include: { _count: { select: { submissions: { where: { status: 'PUBLISHED' } } } } },
            orderBy: { title: 'asc' },
          },
          settings: true,
        },
      })
      if (!tenant) throw new TRPCError({ code: 'NOT_FOUND' })
      return tenant
    }),

  articles: publicProcedure
    .input(z.object({
      tenantSlug:     z.string(),
      publicationId:  z.string().uuid().optional(),
      page:           z.number().min(1).default(1),
      limit:          z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const tenant = await ctx.prisma.tenant.findUnique({ where: { slug: input.tenantSlug } })
      if (!tenant) throw new TRPCError({ code: 'NOT_FOUND' })

      const where: Record<string, unknown> = {
        tenantId: tenant.id,
        status:   'PUBLISHED',
      }
      if (input.publicationId) where['publicationId'] = input.publicationId

      const [submissions, total] = await Promise.all([
        ctx.prisma.submission.findMany({
          where,
          include: {
            author:      { select: { firstName: true, lastName: true } },
            publication: { select: { id: true, title: true, issn: true } },
            issue:       { select: { id: true, volume: true, number: true, year: true } },
          },
          orderBy: { updatedAt: 'desc' },
          skip:    (input.page - 1) * input.limit,
          take:    input.limit,
        }),
        ctx.prisma.submission.count({ where }),
      ])

      return { submissions, total, page: input.page, limit: input.limit }
    }),

  article: publicProcedure
    .input(z.object({
      tenantSlug: z.string(),
      doi:        z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const tenant = await ctx.prisma.tenant.findUnique({ where: { slug: input.tenantSlug } })
      if (!tenant) throw new TRPCError({ code: 'NOT_FOUND' })

      const submission = await ctx.prisma.submission.findFirst({
        where:   { tenantId: tenant.id, doi: input.doi, status: 'PUBLISHED' },
        include: {
          author:      { select: { firstName: true, lastName: true, orcid: true, affiliation: true } },
          publication: { select: { id: true, title: true, issn: true } },
          issue:       { select: { id: true, volume: true, number: true, year: true, publishedAt: true } },
          outputs: {
            where:   { status: 'COMPLETED', format: { in: ['PDF_PRINT', 'PDF_WEB', 'HTML', 'EPUB', 'JATS_XML'] } },
            orderBy: { createdAt: 'desc' },
          },
        },
      })
      if (!submission) throw new TRPCError({ code: 'NOT_FOUND' })
      return submission
    }),

  // Get download URL for a public output (no auth required)
  outputDownloadUrl: publicProcedure
    .input(z.object({
      tenantSlug: z.string(),
      outputId:   z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const output = await ctx.prisma.output.findFirst({
        where:   { id: input.outputId, status: 'COMPLETED', submission: { tenant: { slug: input.tenantSlug }, status: 'PUBLISHED' } },
        include: { submission: { select: { tenantId: true } } },
      })
      if (!output) throw new TRPCError({ code: 'NOT_FOUND' })
      const url = await ctx.minio.client.presignedGetObject(ctx.minio.bucket, output.minioKey, 3600)
      return { url, format: output.format }
    }),
})
