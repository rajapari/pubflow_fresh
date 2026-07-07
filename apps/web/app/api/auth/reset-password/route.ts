import { NextRequest, NextResponse } from 'next/server'
import { requireEnv } from '@/lib/env'

const KC_URL        = process.env.NEXT_PUBLIC_KEYCLOAK_URL    ?? 'http://localhost:8080'
const KC_REALM      = process.env.NEXT_PUBLIC_KEYCLOAK_REALM  ?? 'pubflow'
const KC_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER         ?? 'admin'

async function getAdminToken(): Promise<string> {
  // No fallback password: a well-known default here would let anyone with
  // the source code authenticate as the Keycloak realm admin.
  const adminPassword = requireEnv('KEYCLOAK_ADMIN_PASSWORD')
  const r = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password', client_id: 'admin-cli',
      username: KC_ADMIN_USER, password: adminPassword,
    }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('Keycloak admin auth failed')
  return d.access_token as string
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    const adminToken = await getAdminToken()

    // Find user by email in Keycloak
    const searchRes = await fetch(
      `${KC_URL}/admin/realms/${KC_REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )
    const users = await searchRes.json() as Array<{ id: string }>

    // Always return 200 — don't reveal whether the email is registered
    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ ok: true })
    }

    const userId = users[0].id

    // Trigger Keycloak's built-in "reset password" email action
    await fetch(
      `${KC_URL}/admin/realms/${KC_REALM}/users/${userId}/execute-actions-email`,
      {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body:    JSON.stringify(['UPDATE_PASSWORD']),
      },
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reset-password]', err)
    // Still return 200 to avoid leaking info about Keycloak availability
    return NextResponse.json({ ok: true })
  }
}
