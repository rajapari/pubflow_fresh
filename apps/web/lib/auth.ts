'use client'

export const AUTH_TOKEN_KEY         = 'pubflow_token'
export const AUTH_REFRESH_TOKEN_KEY = 'pubflow_refresh_token'

const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'

export function saveAuthToken(token: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    document.cookie = `${AUTH_TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 30}${isSecure ? '; secure' : ''}`
  } catch { /* no-op */ }
}

export function saveRefreshToken(token: string) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, token) } catch { /* no-op */ }
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(AUTH_REFRESH_TOKEN_KEY) } catch { return null }
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY)
    document.cookie = `${AUTH_TOKEN_KEY}=; path=/; max-age=0`
  } catch { /* no-op */ }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(AUTH_TOKEN_KEY) } catch { return null }
}

/** Returns the JWT exp (seconds since epoch), or 0 if unreadable. */
export function getTokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof decoded.exp === 'number' ? decoded.exp : 0
  } catch { return 0 }
}

/** True if the access token is missing or within 60 s of expiry. */
export function isTokenExpiredOrMissing(): boolean {
  const token = getAuthToken()
  if (!token) return true
  return Date.now() / 1000 > getTokenExpiry(token) - 60
}

/** Attempts to get a fresh access token from Keycloak using the stored refresh token.
 *  Returns the new access token string, or null on failure. */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  const kcUrl    = process.env.NEXT_PUBLIC_KEYCLOAK_URL       ?? 'http://localhost:8080'
  const kcRealm  = process.env.NEXT_PUBLIC_KEYCLOAK_REALM     ?? 'pubflow'
  const kcClient = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'pubflow-web'

  try {
    const res = await fetch(`${kcUrl}/realms/${kcRealm}/protocol/openid-connect/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     kcClient,
        refresh_token: refreshToken,
      }),
    })
    const data = await res.json()
    if (!data.access_token) return null
    saveAuthToken(data.access_token)
    if (data.refresh_token) saveRefreshToken(data.refresh_token)
    return data.access_token as string
  } catch {
    return null
  }
}
