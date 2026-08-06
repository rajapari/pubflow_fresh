#!/usr/bin/env node
// ── Free staging/demo environment launcher ───────────────
// One command instead of docs/staging-environment-setup.md's Steps 3-7:
// starts 4 Cloudflare quick tunnels (web/api/keycloak/onlyoffice — the
// browser talks to all four directly, see that doc for why), writes the two
// env files the app needs (.env.demo for api/worker, apps/web/.env.local
// for the browser-facing NEXT_PUBLIC_* vars — Next.js doesn't read the root
// .env at all), updates Keycloak's pubflow-web client redirect URIs via the
// Admin API (editing realm-export.json does nothing once Keycloak's already
// imported it once), then starts `pnpm dev:demo`.
//
// Usage: node scripts/start-demo.mjs
// Stop:  Ctrl+C — cleans up all 5 spawned process trees (4 tunnels + dev:demo).
//
// Prerequisites (docs/staging-environment-setup.md Steps 1-2):
//   - cloudflared installed
//   - `pnpm docker:dev:tools` already running
//   - `pnpm db:migrate:dev` already run at least once

import { spawn, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
process.chdir(ROOT)
if (existsSync('.env')) process.loadEnvFile('.env')

const CLOUDFLARED = findCloudflared()
const TUNNEL_TIMEOUT_MS = 30_000
// Quick-tunnel hostnames are always 4 hyphen-separated random words
// (e.g. technical-glucose-investments-featuring.trycloudflare.com) — require
// at least 3 hyphens so this doesn't match short Cloudflare-internal
// references like "api.trycloudflare.com" that can appear elsewhere in
// cloudflared's own diagnostic output (confirmed happening: an earlier
// version of this regex grabbed exactly that instead of the real assigned
// hostname).
const URL_RE = /https:\/\/[a-z0-9]+(?:-[a-z0-9]+){3,}\.trycloudflare\.com/

const TUNNELS = [
  { key: 'web', port: 3000 },
  { key: 'api', port: 3001 },
  { key: 'keycloak', port: 8080 },
  { key: 'onlyoffice', port: 8081 },
]

const children = [] // { name, proc } — everything we spawn, for cleanup

function log(msg) { console.log(`[start-demo] ${msg}`) }
function fail(msg) { console.error(`[start-demo] ERROR: ${msg}`); cleanup(1) }

function findCloudflared() {
  const candidates = [
    'cloudflared', // already on PATH
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ]
  for (const c of candidates) {
    try {
      execSync(`"${c}" --version`, { stdio: 'ignore' })
      return c
    } catch { /* try next */ }
  }
  console.error(
    '[start-demo] ERROR: cloudflared not found on PATH or in the usual install locations.\n' +
    'Install it first — docs/staging-environment-setup.md Step 1.',
  )
  process.exit(1)
}

function portInUse(port) {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(true))
    srv.once('listening', () => srv.close(() => resolve(false)))
    srv.listen(port, '127.0.0.1')
  })
}

function killTree(pid) {
  try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }) } catch { /* already dead */ }
}

let cleaningUp = false
function cleanup(exitCode = 0) {
  if (cleaningUp) return
  cleaningUp = true
  log('shutting down — stopping all spawned processes...')
  for (const { name, proc } of children) {
    if (proc.pid) { log(`  stopping ${name} (pid ${proc.pid})`); killTree(proc.pid) }
  }
  process.exit(exitCode)
}
process.on('SIGINT', () => cleanup(0))
process.on('SIGTERM', () => cleanup(0))

async function startTunnel(key, port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${port}`], { shell: false })
    children.push({ name: `tunnel:${key}`, proc })

    let buf = ''
    const timer = setTimeout(() => {
      reject(new Error(`${key} tunnel didn't report a URL within ${TUNNEL_TIMEOUT_MS / 1000}s`))
    }, TUNNEL_TIMEOUT_MS)

    const onData = (chunk) => {
      buf += chunk.toString()
      const m = buf.match(URL_RE)
      if (m) {
        clearTimeout(timer)
        proc.stderr.off('data', onData)
        proc.stdout.off('data', onData)
        log(`${key} tunnel → ${m[0]}`)
        resolve(m[0])
      }
    }
    proc.stderr.on('data', onData)
    proc.stdout.on('data', onData)
    proc.on('exit', (code) => {
      if (code !== null && code !== 0) reject(new Error(`${key} tunnel exited early (code ${code})`))
    })
  })
}

function writeEnvDemo(urls) {
  const src = readFileSync('.env', 'utf-8')
  const overrides = { API_URL: urls.api, APP_URL: urls.web, ONLYOFFICE_URL: urls.onlyoffice }
  const lines = src.split('\n').map((line) => {
    for (const [key, val] of Object.entries(overrides)) {
      if (line.startsWith(`${key}=`)) return `${key}=${val}`
    }
    return line
  })
  writeFileSync('.env.demo', lines.join('\n'))
  log('wrote .env.demo')
}

function writeWebEnvLocal(urls) {
  // Read the existing (localhost) values out of .env rather than hardcoding
  // fallbacks here — realm/client-id are whatever this deployment actually
  // configured, only the *URL* needs to become the tunnel URL.
  const content =
    `NEXT_PUBLIC_API_URL=${urls.api}\n` +
    `NEXT_PUBLIC_KEYCLOAK_URL=${urls.keycloak}\n` +
    `NEXT_PUBLIC_KEYCLOAK_REALM=${process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'pubflow'}\n` +
    `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=${process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'pubflow-web'}\n`
  writeFileSync(path.join('apps', 'web', '.env.local'), content)
  log('wrote apps/web/.env.local')
}

async function updateKeycloakRedirects(webUrl) {
  const kcBase = 'http://localhost:8080'
  const adminPw = process.env.KEYCLOAK_ADMIN_PASSWORD
  if (!adminPw) { log('KEYCLOAK_ADMIN_PASSWORD not set — skipping Keycloak redirect-URI update (login via the tunnel will fail until you do this manually).'); return }

  const tokenRes = await fetch(`${kcBase}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: adminPw }),
  })
  if (!tokenRes.ok) { log(`Keycloak admin login failed (HTTP ${tokenRes.status}) — skipping redirect-URI update.`); return }
  const { access_token: token } = await tokenRes.json()

  const listRes = await fetch(`${kcBase}/admin/realms/pubflow/clients?clientId=pubflow-web`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const [client] = await listRes.json()
  if (!client) { log('pubflow-web client not found — skipping redirect-URI update.'); return }

  // Drop stale trycloudflare.com entries from previous runs (URLs regenerate
  // every run — no point accumulating dead ones), keep everything else,
  // add the fresh one.
  const isStaleTunnel = (u) => u.includes('.trycloudflare.com')
  client.redirectUris = [...client.redirectUris.filter((u) => !isStaleTunnel(u)), `${webUrl}/*`]
  client.webOrigins = [...client.webOrigins.filter((u) => !isStaleTunnel(u)), webUrl]

  const putRes = await fetch(`${kcBase}/admin/realms/pubflow/clients/${client.id}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(client),
  })
  if (!putRes.ok) { log(`Keycloak client update failed (HTTP ${putRes.status}).`); return }
  log('Keycloak pubflow-web client redirect URIs updated')
}

async function main() {
  log('checking prerequisites...')
  for (const svc of ['postgres', 'redis', 'minio', 'keycloak', 'onlyoffice']) {
    try { execSync(`docker inspect -f "{{.State.Running}}" pubflow_${svc}`, { stdio: 'pipe' }) }
    catch { fail(`pubflow_${svc} container not running — start it first: pnpm docker:dev:tools`) }
  }
  // Only web/api (3000/3001) need to be FREE — pnpm dev:demo binds those
  // itself in a moment. keycloak (8080) and onlyoffice (8081) need the
  // OPPOSITE: already occupied by their Docker containers (checked above),
  // since cloudflared connects to them as a client, it doesn't bind them.
  for (const port of [3000, 3001]) {
    if (await portInUse(port)) fail(`port ${port} is already in use — stop whatever's running there first (a leftover pnpm dev/dev:demo?) and retry.`)
  }

  log('starting 4 Cloudflare tunnels (this takes ~10-15s each)...')
  const results = await Promise.allSettled(TUNNELS.map(({ key, port }) => startTunnel(key, port)))
  const failed = results.filter((r) => r.status === 'rejected')
  if (failed.length) {
    for (const f of failed) console.error(`[start-demo]   ${f.reason.message}`)
    fail('one or more tunnels failed to start — see above.')
  }
  const urls = Object.fromEntries(TUNNELS.map(({ key }, i) => [key, results[i].value]))

  writeEnvDemo(urls)
  writeWebEnvLocal(urls)
  await updateKeycloakRedirects(urls.web)

  log('starting pnpm dev:demo...')
  const dev = spawn('pnpm', ['dev:demo'], { stdio: 'inherit', shell: true })
  children.push({ name: 'dev:demo', proc: dev })
  dev.on('exit', (code) => cleanup(code ?? 0))

  console.log('\n' + '='.repeat(72))
  console.log(`  Share this URL:  ${urls.web}`)
  console.log('='.repeat(72))
  console.log(`  api:        ${urls.api}`)
  console.log(`  keycloak:   ${urls.keycloak}`)
  console.log(`  onlyoffice: ${urls.onlyoffice}`)
  console.log('\n  Press Ctrl+C to stop everything (tunnels + app) cleanly.\n')
}

main().catch((err) => fail(err.stack ?? String(err)))
