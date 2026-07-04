import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { QUEUES } from '@pubflow/types'
import { router, protectedProcedure, editorProcedure } from '../trpc/procedures.js'

// Publisher layout templates: upload an InDesign IDML or LaTeX template, then
// port it into a reusable Scribus (.sla) / LaTeX (.cls) asset that the
// typesetting stage consumes via `templateId`.
export const layoutTemplateRouter = router({
  list: protectedProcedure
    .input(z.object({ publicationId: z.string().uuid().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.layoutTemplate.findMany({
        where: {
          tenantId: ctx.user.tenantId,
          ...(input.publicationId
            ? { OR: [{ publicationId: input.publicationId }, { publicationId: null }] }
            : {}),
        },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      })
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.layoutTemplate.findFirst({
        where: { id: input.id, tenantId: ctx.user.tenantId },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      return tpl
    }),

  getUploadUrl: editorProcedure
    .input(z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const minioKey = `templates/${ctx.user.tenantId}/sources/${Date.now()}_${input.filename}`
      const url = await ctx.minio.getPresignedUrl(minioKey)
      return { url, minioKey }
    }),

  // Register the uploaded publisher layout and queue the porting bot.
  create: editorProcedure
    .input(z.object({
      name:          z.string().min(2).max(150),
      sourceMinioKey: z.string().min(1),
      sourceFormat:  z.enum(['IDML', 'INDD', 'LATEX', 'PDF']),
      targetEngine:  z.enum(['SCRIBUS', 'LATEX']),
      publicationId: z.string().uuid().optional(),
      isDefault:     z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      if (input.publicationId) {
        const pub = await prisma.publication.findFirst({
          where: { id: input.publicationId, tenantId: user.tenantId },
        })
        if (!pub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Publication not found' })
      }
      if (input.sourceFormat === 'LATEX' && input.targetEngine !== 'LATEX')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'LaTeX sources can only target the LATEX engine' })

      const template = await prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.layoutTemplate.updateMany({
            where: { tenantId: user.tenantId, publicationId: input.publicationId ?? null },
            data:  { isDefault: false },
          })
        }
        return tx.layoutTemplate.create({
          data: {
            tenantId:       user.tenantId,
            publicationId:  input.publicationId,
            name:           input.name,
            sourceFormat:   input.sourceFormat,
            targetEngine:   input.targetEngine,
            sourceMinioKey: input.sourceMinioKey,
            isDefault:      input.isDefault,
            status:         'DRAFT',
          },
        })
      })

      await queues[QUEUES.TEMPLATE].add('port-template', {
        type:          'TEMPLATE_PORT',
        templateId:    template.id,
        sourceMinioKey: input.sourceMinioKey,
        sourceFormat:  input.sourceFormat.toLowerCase(),
        targetEngine:  input.targetEngine,
      })

      return template
    }),

  // Re-run the porting bot (e.g. after replacing the source file).
  reprocess: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.layoutTemplate.findFirst({
        where: { id: input.id, tenantId: ctx.user.tenantId },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.queues[QUEUES.TEMPLATE].add('port-template', {
        type:          'TEMPLATE_PORT',
        templateId:    tpl.id,
        sourceMinioKey: tpl.sourceMinioKey,
        sourceFormat:  tpl.sourceFormat.toLowerCase(),
        targetEngine:  tpl.targetEngine === 'SCRIBUS' ? 'SCRIBUS' : 'LATEX',
      })
      return { queued: true }
    }),

  getDownloadUrl: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.layoutTemplate.findFirst({
        where: { id: input.id, tenantId: ctx.user.tenantId },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!tpl.generatedMinioKey)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Template not yet generated' })
      const url = await ctx.minio.client.presignedGetObject(ctx.minio.bucket, tpl.generatedMinioKey, 900)
      return { url, status: tpl.status }
    }),

  delete: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.layoutTemplate.findFirst({
        where: { id: input.id, tenantId: ctx.user.tenantId },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.prisma.layoutTemplate.delete({ where: { id: input.id } })
      return { success: true }
    }),
})
