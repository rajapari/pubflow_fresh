import { defineConfig } from '@playwright/test'

// Real browser click-through tests against the locally running stack
// (web:3000, api:3001, keycloak:8080) — a different layer than
// scripts/e2e-pressure-test.mjs, which drives the same lifecycle via raw
// API calls and never touches a browser or the React code. Needs `pnpm
// dev` (or `pnpm demo`) already running; this config does not start it,
// since the stack takes real dependencies (Docker data services) this
// test runner has no business owning.
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    // localhost, not 127.0.0.1: Keycloak's pubflow-web client CORS allowlist
    // (webOrigins) is configured for http://localhost:3000, and the two are
    // different origins to a browser even though they resolve to the same
    // machine — confirmed live (a 127.0.0.1-origin login attempt gets a real
    // CORS rejection from Keycloak, not a redirect or a 401).
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
