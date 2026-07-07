import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure, protectedProcedure, chiefEditorProcedure, adminProcedure } from '../trpc/procedures.js'
import { QUEUES } from '@pubflow/types'
import { createKeycloakUser } from '../lib/keycloak-admin.js'
import { seedDefaultCatalog } from '../lib/default-publications.js'

export const publicationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.publication.findMany({
      where:   { tenantId: ctx.user.tenantId, status: 'ACTIVE' },
      include: {
        publisher: { select: { id: true, name: true } },
        _count:    { select: { submissions: true } },
      },
      orderBy: { title: 'asc' },
    })
  }),

  // Publisher → journals tree for the submission wizard's cascading selects.
  // One round trip; the client filters journals by the chosen publisher.
  listGrouped: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.publisher.findMany({
      where: { tenantId: ctx.user.tenantId },
      select: {
        id:   true,
        name: true,
        publications: {
          where:   { status: 'ACTIVE' },
          select:  { id: true, title: true, type: true, issn: true, isbn: true, description: true, submissionGuidelines: true },
          orderBy: { title: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
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

  update: chiefEditorProcedure
    .input(z.object({
      id:                   z.string().uuid(),
      title:                z.string().min(1).max(500).optional(),
      description:          z.string().max(5000).optional(),
      issn:                 z.string().optional(),
      isbn:                 z.string().optional(),
      submissionGuidelines: z.string().max(20000).optional(),
      reviewerInstructions: z.string().max(20000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const pub = await ctx.prisma.publication.findFirst({
        where: { id, tenantId: ctx.user.tenantId },
      })
      if (!pub) throw new TRPCError({ code: 'NOT_FOUND' })
      return ctx.prisma.publication.update({ where: { id }, data })
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

const ALL_ROLES = ['SUPER_ADMIN','EDITOR_IN_CHIEF','SECTION_EDITOR','COPY_EDITOR',
  'ARTWORK_EDITOR','TYPESETTER','PROOF_READER','PEER_REVIEWER','AUTHOR','READER'] as const
const INVITABLE_ROLES = ['SECTION_EDITOR','COPY_EDITOR','ARTWORK_EDITOR','TYPESETTER',
  'PROOF_READER','PEER_REVIEWER','AUTHOR'] as const

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
      crossrefLoginId:       z.string().optional(),
      crossrefLoginPassword: z.string().optional(),
      pmcFtpHost:            z.string().optional(),
      pmcFtpUsername:        z.string().optional(),
      pmcFtpPassword:        z.string().optional(),
      pmcFtpPath:            z.string().optional(),
      enablePrintOnDemand:   z.boolean().optional(),
      luluClientKey:         z.string().optional(),
      luluClientSecret:      z.string().optional(),
      luluPodPackageId:      z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.tenantSettings.upsert({
        where:  { tenantId: ctx.user.tenantId },
        update: input,
        create: { tenantId: ctx.user.tenantId, ...input },
      })
    }),

  // ── Self-service registration (public — no auth) ──────────────────────
  register: publicProcedure
    .input(z.object({
      orgName:   z.string().min(2).max(200),
      slug:      z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
      firstName: z.string().min(1).max(100),
      lastName:  z.string().min(1).max(100),
      email:     z.string().email(),
      plan:      z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']).default('STARTER'),
    }))
    .mutation(async ({ ctx, input }) => {
      const slugTaken = await ctx.prisma.tenant.findUnique({ where: { slug: input.slug } })
      if (slugTaken) throw new TRPCError({ code: 'CONFLICT', message: 'This organisation slug is already taken' })

      let keycloakId: string
      try {
        keycloakId = await createKeycloakUser(input.email)
      } catch (err: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Account setup failed: ${err.message}` })
      }

      const result = await ctx.prisma.$transaction(async tx => {
        const tenant = await tx.tenant.create({
          data: {
            name:   input.orgName,
            slug:   input.slug,
            plan:   input.plan,
            status: 'ACTIVE',
            settings: { create: { primaryColor: '#534AB7', enablePeerReview: true } },
          },
        })
        const user = await tx.user.create({
          data: {
            tenantId:  tenant.id,
            keycloakId,
            email:     input.email,
            firstName: input.firstName,
            lastName:  input.lastName,
            role:      'EDITOR_IN_CHIEF',
            status:    'ACTIVE',
          },
        })
        // Seed the publisher → publication catalogue so new tenants have a
        // populated cascading dropdown immediately without manual setup.
        await seedDefaultCatalog(tx, tenant.id)
        return { tenant, user }
      })

      return {
        tenantId: result.tenant.id,
        userId:   result.user.id,
        message:  'Organisation created. Check your email to set your password.',
      }
    }),

  // ── User management ─────────────────────────────────────────────────────

  listUsers: protectedProcedure
    .input(z.object({ status: z.enum(['ACTIVE','INVITED','SUSPENDED']).optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.user.findMany({
        where: {
          tenantId: ctx.user.tenantId,
          status:   input.status ?? { not: 'SUSPENDED' },
        },
        select: { id:true, email:true, firstName:true, lastName:true, role:true, status:true, createdAt:true },
        orderBy: [{ status:'asc' }, { firstName:'asc' }],
      })
    }),

  inviteUser: chiefEditorProcedure
    .input(z.object({
      email:     z.string().email(),
      role:      z.enum(INVITABLE_ROLES),
      firstName: z.string().max(100).optional(),
      lastName:  z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { queues } = ctx

      // Prevent duplicates within same tenant
      const existing = await ctx.prisma.user.findFirst({
        where: { tenantId: ctx.user.tenantId, email: input.email },
      })
      if (existing) throw new TRPCError({ code:'CONFLICT', message:'User already exists in this organisation' })

      let keycloakId: string
      try {
        keycloakId = await createKeycloakUser(input.email)
      } catch (err: any) {
        throw new TRPCError({ code:'INTERNAL_SERVER_ERROR', message:`Failed to create Keycloak account: ${err.message}` })
      }

      const user = await ctx.prisma.user.create({
        data: {
          tenantId:   ctx.user.tenantId,
          keycloakId,
          email:      input.email,
          firstName:  input.firstName ?? null,
          lastName:   input.lastName  ?? null,
          role:       input.role,
          status:     'INVITED',
        },
        select: { id:true, email:true, firstName:true, lastName:true, role:true, status:true },
      })

      await queues[QUEUES.NOTIFICATION].add(`invite-${user.id}`, {
        type:     'NOTIFICATION',
        to:       [input.email],
        template: 'USER_INVITED',
        data:     { email: input.email, role: input.role, firstName: input.firstName },
      })

      return user
    }),

  updateUserRole: chiefEditorProcedure
    .input(z.object({
      userId: z.string().uuid(),
      role:   z.enum(ALL_ROLES),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findFirst({
        where: { id: input.userId, tenantId: ctx.user.tenantId },
      })
      if (!user) throw new TRPCError({ code:'NOT_FOUND' })
      if (user.id === ctx.user.id) throw new TRPCError({ code:'BAD_REQUEST', message:'Cannot change your own role' })

      return ctx.prisma.user.update({
        where: { id: input.userId },
        data:  { role: input.role },
        select: { id:true, email:true, firstName:true, lastName:true, role:true, status:true },
      })
    }),

  removeUser: chiefEditorProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findFirst({
        where: { id: input.userId, tenantId: ctx.user.tenantId },
      })
      if (!user) throw new TRPCError({ code:'NOT_FOUND' })
      if (user.id === ctx.user.id) throw new TRPCError({ code:'BAD_REQUEST', message:'Cannot remove yourself' })

      return ctx.prisma.user.update({
        where: { id: input.userId },
        data:  { status: 'SUSPENDED' },
        select: { id:true, email:true, role:true, status:true },
      })
    }),

  resendInvite: chiefEditorProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findFirst({
        where: { id: input.userId, tenantId: ctx.user.tenantId, status: 'INVITED' },
      })
      if (!user) throw new TRPCError({ code:'NOT_FOUND', message:'Invited user not found' })

      // Re-trigger Keycloak required-action email
      const { createKeycloakUser: _, deleteKeycloakUser: __ } = await import('../lib/keycloak-admin.js')
      // Call execute-actions-email directly
      try {
        const KC_URL   = process.env.KEYCLOAK_URL   ?? 'http://localhost:8080'
        const KC_REALM = process.env.KEYCLOAK_REALM ?? 'pubflow'
        const tokenRes = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type:'password', client_id:'admin-cli', username:'admin', password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? '' }),
        })
        const { access_token } = await tokenRes.json() as { access_token: string }
        await fetch(`${KC_URL}/admin/realms/${KC_REALM}/users/${user.keycloakId}/execute-actions-email`, {
          method:  'PUT',
          headers: { 'Content-Type':'application/json', Authorization:`Bearer ${access_token}` },
          body:    JSON.stringify(['UPDATE_PASSWORD','VERIFY_EMAIL']),
        })
      } catch (err: any) {
        throw new TRPCError({ code:'INTERNAL_SERVER_ERROR', message:`Keycloak error: ${err.message}` })
      }

      return { resent: true }
    }),
})
