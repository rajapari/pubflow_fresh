import { initTRPC, TRPCError } from '@trpc/server'
import { ZodError } from 'zod'
import { Prisma } from '@pubflow/db'
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

// findUniqueOrThrow/findFirstOrThrow raise Prisma's own NotFoundError
// (P2025), not a TRPCError — left unhandled, tRPC wraps it as a 500 and
// forwards the raw ORM message to the client ("An operation failed because
// it depends on one or more records that were required but not found.")
// instead of the clean 404 used everywhere else in the API. Applied first,
// ahead of every other middleware, so it covers every procedure uniformly.
const catchNotFound = middleware(async ({ next }) => {
  const result = await next()
  if (!result.ok && result.error.cause instanceof Prisma.PrismaClientKnownRequestError
      && result.error.cause.code === 'P2025') {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' })
  }
  return result
})

const isAuth = catchNotFound.unstable_pipe(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user as NonNullable<typeof ctx.user> } })
})

const hasRole = (min: UserRole) =>
  isAuth.unstable_pipe(({ ctx, next }) => {
    if (!hasMinRole(ctx.user.role, min))
      throw new TRPCError({ code: 'FORBIDDEN', message: `Requires ${min} role` })
    return next({ ctx })
  })

export const publicProcedure      = t.procedure.use(catchNotFound)
export const protectedProcedure   = t.procedure.use(isAuth)
export const editorProcedure      = t.procedure.use(hasRole('SECTION_EDITOR'))
export const chiefEditorProcedure = t.procedure.use(hasRole('EDITOR_IN_CHIEF'))
export const adminProcedure       = t.procedure.use(hasRole('SUPER_ADMIN'))
