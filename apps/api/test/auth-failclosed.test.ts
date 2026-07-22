// Regression coverage for the auth.ts CRITICAL fix: when Keycloak's public
// key can't be fetched, the plugin used to fall back to a hardcoded secret
// ('pubflow-dev-placeholder') for HS256 verification — anyone who read the
// source could forge a token and authenticate as any user. The fix
// generates a random, process-local secret instead, so verification always
// fails until the API is restarted with Keycloak reachable (fail CLOSED).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import { createHmac } from 'node:crypto'

// Minimal, dependency-free HS256 JWT signer — avoids pulling in a JWT
// library just to forge a test token.
function signHS256(payload: Record<string, unknown>, secret: string): string {
  const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const body   = b64url(payload)
  const sig    = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

let app: FastifyInstance

beforeAll(async () => {
  // Unreachable — ECONNREFUSED fails fast, so the plugin's 4-attempt retry
  // (with 2s backoff) still finishes well inside the default test timeout.
  process.env.KEYCLOAK_URL = 'http://127.0.0.1:1'
  const { authPlugin } = await import('../src/plugins/auth.js')

  app = Fastify({ logger: false })
  await app.register(sensible)
  await app.register(authPlugin)
  app.get('/protected', { preHandler: app.authenticate }, async () => ({ ok: true }))
  await app.ready()
}, 15000)

afterAll(async () => {
  await app.close()
})

describe('auth plugin — fail closed when Keycloak is unreachable', () => {
  it('rejects a request with no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a token forged with the OLD hardcoded fallback secret', async () => {
    const forged = signHS256({ sub: 'attacker', email: 'attacker@evil.example' }, 'pubflow-dev-placeholder')
    const res = await app.inject({
      method: 'GET', url: '/protected',
      headers: { authorization: `Bearer ${forged}` },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a token signed with any other guessable secret', async () => {
    const forged = signHS256({ sub: 'attacker', email: 'attacker@evil.example' }, 'secret')
    const res = await app.inject({
      method: 'GET', url: '/protected',
      headers: { authorization: `Bearer ${forged}` },
    })
    expect(res.statusCode).toBe(401)
  })
})
