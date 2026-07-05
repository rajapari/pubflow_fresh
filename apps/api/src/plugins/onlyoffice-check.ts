import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { createHmac } from 'crypto'

function signJwt(payload: object, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig    = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

/**
 * Startup guard: proves the API and the OnlyOffice Document Server share the
 * same JWT secret by sending a signed "version" command. A secret mismatch is
 * otherwise invisible until a user opens the editor and gets "the document
 * security token is not correctly formed" — this turns it into a loud,
 * unmissable boot-time error on every environment (dev, compose, k8s).
 *
 * Non-fatal by design: the Document Server may still be booting, and the rest
 * of the API is usable without it.
 */
export const onlyofficeCheckPlugin = fp(async (app: FastifyInstance) => {
  const ooUrl  = process.env.ONLYOFFICE_URL ?? 'http://localhost:8081'
  const secret = process.env.ONLYOFFICE_JWT_SECRET

  if (!secret) {
    app.log.error(
      '🛑 ONLYOFFICE_JWT_SECRET is not set — the document editor cannot work. ' +
      'Set it in the environment (same value the Document Server was started with).'
    )
    return
  }

  // Run in the background so a slow-booting Document Server never delays the API.
  void (async () => {
    const body = { c: 'version' } as Record<string, unknown>
    body['token'] = signJwt({ c: 'version' }, secret)

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const res = await fetch(`${ooUrl}/coauthoring/CommandService.ashx`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal:  AbortSignal.timeout(10_000),
        })
        const data = await res.json() as { error?: number; version?: string }

        if (data.error === 0) {
          app.log.info(`✅ OnlyOffice JWT verified (Document Server ${data.version})`)
          return
        }
        if (data.error === 6) {
          app.log.error(
            '🛑 ONLYOFFICE JWT SECRET MISMATCH: the Document Server rejected a token ' +
            'signed with ONLYOFFICE_JWT_SECRET. Every editor session will fail with ' +
            '"security token is not correctly formed" until the Document Server is ' +
            'restarted with the same JWT_SECRET (start the stack via `pnpm docker:dev`, ' +
            'or align the k8s secret).'
          )
          return
        }
        app.log.warn({ response: data }, `⚠️ OnlyOffice check: unexpected response (error ${data.error})`)
        return
      } catch {
        if (attempt < 5) await new Promise(r => setTimeout(r, 15_000))
      }
    }
    app.log.warn(`⚠️ OnlyOffice not reachable at ${ooUrl} — skipped JWT verification. The editor will be unavailable until it is up.`)
  })()
}, { name: 'onlyoffice-check' })
