// Browser-side error tracking. Same optional-service pattern as the API/worker:
// active the moment NEXT_PUBLIC_SENTRY_DSN is set (must be NEXT_PUBLIC_ — this
// file runs in the browser bundle), a safe no-op otherwise.
import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0, // no session replay by default — real cost, opt in later if wanted
    replaysOnErrorSampleRate: 0,
  })
}
