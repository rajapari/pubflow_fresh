#!/usr/bin/env node
// Production build for the API — replaces a plain `tsc` emit.
//
// Why: `tsc -p tsconfig.json` type-checks and compiles apps/api's own
// source fine, but it does NOT bundle workspace dependencies — it leaves
// `import ... from '@pubflow/types'` as-is, to be resolved by Node at
// runtime via node_modules. @pubflow/types has no build step of its own
// (package.json: "exports": { ".": "./src/index.ts" }) — it ships raw
// TypeScript, whose sibling re-exports use the NodeNext ESM convention
// (e.g. `export * from './auth.js'`, where the .js specifier means the
// sibling auth.ts). tsx/vitest's esbuild-based loaders resolve that .js
// specifier to the .ts file transparently, which is why `pnpm dev` and
// `pnpm test` never hit this — but plain `node dist/server.js` (what the
// production Docker image actually runs) has no such loader, so it fails
// at startup with ERR_MODULE_NOT_FOUND for './auth.js'. Confirmed by
// actually building and booting the production Docker image locally.
//
// Fix: bundle @pubflow/types (and the one @pubflow/db/catalog data-only
// subpath apps/api imports) directly into dist/server.js via esbuild —
// the same resolver tsx already uses for dev — while keeping every real
// npm dependency external (unbundled, resolved normally via node_modules).
// @pubflow/db itself stays external too: its generated Prisma client
// (packages/db/generated/client) is real compiled JS already, and its
// native query-engine binary must not be bundled.
//
// Type-checking still happens — unchanged — via each workspace's own
// `lint` script (`tsc --noEmit`), run independently in CI's `check` job.
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => d !== '@pubflow/types')

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external,
  sourcemap: true,
  logLevel: 'info',
})
