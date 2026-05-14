import { initTRPC, TRPCError } from '@trpc/server'
import { ZodError } from 'zod'
import type { Context } from './context.js'
import type { UserRole } from '@pubflow/types'
import { hasMinRole } from '@pubflow/types'

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router    = t.router
export const middleware = t.middleware

type TRPCProcedure = typeof t.procedure

const isAuth = middleware(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user as NonNullable<typeof ctx.user> } })
})

const hasRole = (min: UserRole) =>
  isAuth.unstable_pipe(({ ctx, next }) => {
    if (!hasMinRole(ctx.user.role, min))
      throw new TRPCError({ code: 'FORBIDDEN', message: `Requires ${min} role` })
    return next({ ctx })
  })

export const publicProcedure      = t.procedure
export const protectedProcedure   = t.procedure.use(isAuth)
export const editorProcedure      = t.procedure.use(hasRole('SECTION_EDITOR'))
export const chiefEditorProcedure = t.procedure.use(hasRole('EDITOR_IN_CHIEF'))
export const adminProcedure       = t.procedure.use(hasRole('SUPER_ADMIN'))
