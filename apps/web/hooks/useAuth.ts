'use client'
import { useEffect, useState, useCallback } from 'react'
import Keycloak from 'keycloak-js'
import { saveAuthToken, clearAuthToken, getAuthToken } from '@/lib/auth'

let kc: Keycloak | null = null
let kcInitialized = false

function getKC() {
  if (!kc) kc = new Keycloak({
    url:      process.env.NEXT_PUBLIC_KEYCLOAK_URL       ?? 'http://localhost:8080',
    realm:    process.env.NEXT_PUBLIC_KEYCLOAK_REALM     ?? 'pubflow',
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'pubflow-web',
  })
  return kc
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

    let initPromise: Promise<boolean>
    if (kcInitialized) {
      initPromise = Promise.resolve(k.authenticated ?? false)
    } else {
      kcInitialized = true
      initPromise = k.init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        silentCheckSsoFallback: false,
      })
    }

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

  const login = useCallback(
    () => getKC().login({ redirectUri: `${window.location.origin}/auth/callback` }),
    []
  )

  const logout = useCallback(() => {
    clearAuthToken()
    if (kcInitialized) {
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