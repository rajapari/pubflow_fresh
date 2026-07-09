// Server-side (Node runtime) error tracking for API routes and server
// components. Falls back to NEXT_PUBLIC_SENTRY_DSN if a server-only
// SENTRY_DSN isn't set separately — one DSN is enough for most setups.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })
}
