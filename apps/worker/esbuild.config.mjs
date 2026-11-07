#!/usr/bin/env node
// Production build for the worker — see apps/api/esbuild.config.mjs for the
// full rationale (same fix, same root cause: @pubflow/types ships raw
// TypeScript with no build step, which a plain `node dist/worker.js` can't
// resolve the way tsx/vitest's dev-time esbuild loaders do).
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => d !== '@pubflow/types')

await build({
  entryPoints: ['src/worker.ts'],
  outfile: 'dist/worker.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external,
  sourcemap: true,
  logLevel: 'info',
})
