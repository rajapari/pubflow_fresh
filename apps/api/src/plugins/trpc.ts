import fp from 'fastify-plugin'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import type { FastifyInstance } from 'fastify'
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { appRouter } from '../routers/index.js'
import { createContext } from '../trpc/context.js'

export const trpcPlugin = fp(
  async (app: FastifyInstance, opts: { prefix: string }) => {
    await app.register(fastifyTRPCPlugin, {
      prefix: opts.prefix,
      trpcOptions: {
        router: appRouter,
        createContext: (o: CreateFastifyContextOptions) => createContext(o, app),
        onError({ error, path }: { error: unknown; path?: string | undefined }) {
          if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'INTERNAL_SERVER_ERROR')
            app.log.error({ error, path }, 'tRPC error')
        },
      },
    })
  },
  { name: 'trpc' }
)
