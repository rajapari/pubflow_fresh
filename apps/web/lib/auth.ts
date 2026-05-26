'use client'

export const AUTH_TOKEN_KEY = 'pubflow_token'

const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'

export function saveAuthToken(token: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    document.cookie = `${AUTH_TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 30}${isSecure ? '; secure' : ''}`
  } catch {
    // no-op in browsers with strict storage settings
  }
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    document.cookie = `${AUTH_TOKEN_KEY}=; path=/; max-age=0`
  } catch {
    // no-op
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}
