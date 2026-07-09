// Edge runtime (middleware, edge API routes) error tracking. Currently
// pubflow-web doesn't use the edge runtime anywhere, but Next.js's Sentry
// integration expects this file to exist regardless.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })
}
