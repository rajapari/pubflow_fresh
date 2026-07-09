// Error tracking — same optional-external-service pattern as lib/ai.ts's
// aiEnabled(): active the moment SENTRY_DSN is set, a safe no-op otherwise.
// Free tier at sentry.io is enough to start; self-hosted works identically,
// just point SENTRY_DSN at your own instance.
import * as Sentry from '@sentry/node'
import type { FastifyInstance } from 'fastify'

export function sentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN)
}

export function initSentry(): void {
  if (!sentryEnabled()) return
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  })
}

/** Report an exception with tenant/user context, honoring the same off-switch. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled()) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}

/** Registers a Fastify error hook that reports 5xx errors, then re-throws
 *  unchanged so existing error handling/responses are untouched. */
export function registerSentryErrorHandler(app: FastifyInstance): void {
  if (!sentryEnabled()) return
  app.addHook('onError', async (req, _reply, error) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    if (statusCode < 500) return // 4xx are expected user errors, not incidents
    captureException(error, {
      method: req.method,
      url: req.url,
      tenantId: (req as { user?: { tenantId?: string } }).user?.tenantId,
    })
  })
}
