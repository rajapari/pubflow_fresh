'use client'
import { useEffect, useState, useCallback } from 'react'
import Keycloak from 'keycloak-js'
import { saveAuthToken, clearAuthToken, getAuthToken, getTokenExpiry, refreshAccessToken } from '@/lib/auth'

let kc: Keycloak | null = null
let kcInitPromise: Promise<boolean> | null = null

function getKC() {
  if (!kc) kc = new Keycloak({
    url:      process.env.NEXT_PUBLIC_KEYCLOAK_URL       ?? 'http://localhost:8080',
    realm:    process.env.NEXT_PUBLIC_KEYCLOAK_REALM     ?? 'pubflow',
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'pubflow-web',
  })
  return kc
}

// `Keycloak.init()` may only be called once per instance, but React 18's
// Strict Mode (on by default in Next.js dev) deliberately double-invokes
// effects — mount, discard, mount again. A plain boolean guard here used
// to make the *second* invocation take a synchronous shortcut
// (`k.authenticated` read immediately) instead of awaiting the real
// exchange the *first* invocation had already kicked off — and since that
// real exchange is async, the shortcut routinely read `false` before it
// resolved, losing a login that had just actually succeeded. Confirmed
// live: intermittent (not every time) failures on /auth/callback despite
// Keycloak having issued a real authorization code. Sharing the init
// *promise* itself means every caller — the double-invoked effect below,
// and the login button's handler — awaits the exact same outcome instead
// of racing a second, premature one.
function ensureKeycloakInit(options: Parameters<Keycloak['init']>[0]): Promise<boolean> {
  if (!kcInitPromise) kcInitPromise = getKC().init(options)
  return kcInitPromise
}

export interface AuthUser {
  id: string; email: string; firstName?: string
  lastName?: string; role: string; tenantId: string
}

function parseRoles(claims: Record<string, unknown>): string[] {
  const rawRole = claims['role'] ?? claims['roles']
  if (typeof rawRole === 'string') return [rawRole]
  if (Array.isArray(rawRole)) return rawRole.filter((value): value is string => typeof value === 'string')

  const realmAccess = claims['realm_access'] as { roles?: unknown[] } | undefined
  if (realmAccess?.roles && Array.isArray(realmAccess.roles)) {
    return realmAccess.roles.filter((value): value is string => typeof value === 'string')
  }

  const resourceAccess = claims['resource_access'] as Record<string, { roles?: unknown[] }> | undefined
  if (resourceAccess) {
    for (const client of Object.values(resourceAccess)) {
      if (client?.roles && Array.isArray(client.roles)) {
        return client.roles.filter((value): value is string => typeof value === 'string')
      }
    }
  }

  return []
}

function extractUser(k: Keycloak): AuthUser | null {
  if (!k.token || !k.tokenParsed) return null
  const p = k.tokenParsed as Record<string, unknown>
  const roles = parseRoles(p)
  const role = roles[0] ?? 'AUTHOR'
  const tenantId = (p['tenantId'] ?? p['tenant_id']) as string | undefined

  return {
    id:        p['sub']         as string,
    email:     p['email']       as string,
    firstName: typeof p['given_name'] === 'string' ? p['given_name'] : undefined,
    lastName:  typeof p['family_name'] === 'string' ? p['family_name'] : undefined,
    tenantId:  tenantId ?? '',
    role,
  }
}

function saveToken(token: string) {
  try { localStorage.setItem('pubflow_token', token) } catch { /* no-op in SSR */ }
}

function clearToken() {
  try { localStorage.removeItem('pubflow_token') } catch { /* no-op in SSR */ }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const decoded = decodeURIComponent(escape(atob(padded)))
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

function extractUserFromClaims(claims: Record<string, unknown>): AuthUser | null {
  const email = claims['email'] as string | undefined
  const sub = claims['sub'] as string | undefined
  if (!sub || !email) return null

  const roles = parseRoles(claims)
  const role = roles[0] ?? 'AUTHOR'
  const tenantId = (claims['tenantId'] ?? claims['tenant_id']) as string | undefined

  return {
    id: sub,
    email,
    firstName: typeof claims['given_name'] === 'string' ? claims['given_name'] : undefined,
    lastName: typeof claims['family_name'] === 'string' ? claims['family_name'] : undefined,
    tenantId: tenantId ?? '',
    role,
  }
}

export function useAuth() {
  const [ready,  setReady]  = useState(false)
  const [authed, setAuthed] = useState(false)
  const [user,   setUser]   = useState<AuthUser | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const token = getAuthToken()
    const isCallback = window.location.pathname === '/auth/callback'

    if (token && !isCallback) {
      const exp = getTokenExpiry(token)
      const expired = exp > 0 && Date.now() / 1000 > exp

      if (expired) {
        // Silently try to refresh before giving up
        refreshAccessToken().then(fresh => {
          const t = fresh ?? token
          const claims = parseJwtPayload(t)
          if (claims && fresh) {
            const parsedUser = extractUserFromClaims(claims)
            if (parsedUser) { setUser(parsedUser); setAuthed(true) }
          } else {
            clearAuthToken()
          }
          setReady(true)
        })
        return
      }

      const claims = parseJwtPayload(token)
      if (claims) {
        const parsedUser = extractUserFromClaims(claims)
        if (parsedUser) {
          setUser(parsedUser)
          setAuthed(true)
        }
      }

      setReady(true)
      return
    }

    if (!isCallback) {
      setReady(true)
      return
    }

    const k = getKC()
    const initPromise = ensureKeycloakInit({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      checkLoginIframe: false,
      silentCheckSsoFallback: false,
    })

    let intervalId: ReturnType<typeof setInterval> | null = null

    initPromise
      .then((ok) => {
        if (ok && k.token && k.tokenParsed) {
          saveAuthToken(k.token)
          setUser(extractUser(k))
          setAuthed(true)

          intervalId = setInterval(() => {
            k.updateToken(60)
              .then((refreshed) => { if (refreshed && k.token) saveAuthToken(k.token) })
              .catch(() => console.warn('Token refresh failed'))
          }, 30_000)
        }
      })
      .catch(() => console.warn('Keycloak not available'))
      .finally(() => setReady(true))

    return () => { if (intervalId !== null) clearInterval(intervalId) }
  }, [])

  // `keycloak-js`'s `login()` only builds a PKCE code_challenge when the
  // instance's `pkceMethod` is already set — and that's set by `.init()`,
  // never by `.login()` itself (confirmed against keycloak-js's own
  // source: pkceMethod lives on KeycloakInitOptions, not
  // KeycloakLoginOptions). On this page, `.init()` has normally never run
  // yet (the effect above only calls it on /auth/callback), so a bare
  // `getKC().login(...)` silently omits code_challenge entirely — Keycloak
  // then rejects the request outright ("Missing parameter:
  // code_challenge_method") since pubflow-web requires PKCE. Confirmed
  // live before this fix: every SSO attempt failed this way.
  //
  // Fix: initialize (idempotently — see ensureKeycloakInit) with
  // onLoad: 'login-required' — init() itself performs the (correctly
  // PKCE'd) redirect when the user isn't already authenticated, so this
  // call normally never resolves; the page navigates away first. If
  // something *else* already initialized this singleton earlier in the
  // same SPA session, pkceMethod is already set and ensureKeycloakInit
  // just returns that same (resolved) promise instead of calling init()
  // a second time.
  const login = useCallback(async () => {
    await ensureKeycloakInit({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      redirectUri: `${window.location.origin}/auth/callback`,
      checkLoginIframe: false,
      silentCheckSsoFallback: false,
    })
  }, [])

  const logout = useCallback(() => {
    clearAuthToken()
    if (kcInitPromise) {
      try {
        getKC().logout({ redirectUri: window.location.origin })
        return
      } catch {
        // fall through to manual redirect below
      }
    }
    window.location.href = '/'
  }, [])

  return { ready, authed, user, login, logout }
}