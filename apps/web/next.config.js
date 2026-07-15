/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pubflow/types'],
  // apps/web/Dockerfile's production CMD runs the standalone server output
  // directly (apps/web/.next/standalone/server.js) — without this, that
  // file never gets built and the container crashes on startup.
  output: 'standalone',
}

// Only wrap with Sentry's build plugin when actually configured — keeps the
// build identical (same speed, same output) until SENTRY_DSN is set. Source
// map upload additionally needs SENTRY_AUTH_TOKEN/ORG/PROJECT; without those
// the plugin just skips upload rather than failing the build.
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  const { withSentryConfig } = require('@sentry/nextjs')
  module.exports = withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    widenClientFileUpload: false,
    disableLogger: true,
  })
} else {
  module.exports = nextConfig
}
