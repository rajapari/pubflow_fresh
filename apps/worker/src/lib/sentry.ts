// Error tracking — same optional-external-service pattern as lib/ai.ts's
// aiEnabled(): active the moment SENTRY_DSN is set, a safe no-op otherwise.
import * as Sentry from '@sentry/node'

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

/** Report an exception with job/queue context, honoring the same off-switch. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled()) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
