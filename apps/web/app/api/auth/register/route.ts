import { NextRequest, NextResponse } from 'next/server'

const KC_URL   = process.env.NEXT_PUBLIC_KEYCLOAK_URL    ?? 'http://localhost:8080'
const KC_REALM = process.env.NEXT_PUBLIC_KEYCLOAK_REALM  ?? 'pubflow'
const KC_CLIENT = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'pubflow-web'
const KC_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER     ?? 'admin'
const KC_ADMIN_PASS = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'Admin@PubFlow2025'

async function getAdminToken(): Promise<string> {
  const r = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id:  'admin-cli',
      username:   KC_ADMIN_USER,
      password:   KC_ADMIN_PASS,
    }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('Keycloak admin auth failed')
  return d.access_token as string
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json()

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    // Parse first / last name
    const parts     = (name as string).trim().split(/\s+/)
    const firstName = parts[0]
    const lastName  = parts.slice(1).join(' ') || ''

    const adminToken = await getAdminToken()

    // Check if email already registered
    const checkRes = await fetch(
      `${KC_URL}/admin/realms/${KC_REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )
    const existing = await checkRes.json()
    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    // Create Keycloak user
    const createRes = await fetch(`${KC_URL}/admin/realms/${KC_REALM}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        username:      email,
        email,
        firstName,
        lastName,
        enabled:       true,
        emailVerified: true,
        credentials: [{ type: 'password', value: password, temporary: false }],
      }),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      // Keycloak 409 = user already exists
      if (createRes.status === 409) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
      }
      throw new Error(`Keycloak create user failed: ${createRes.status} ${errText}`)
    }

    // Assign AUTHOR role
    const roleRes = await fetch(`${KC_URL}/admin/realms/${KC_REALM}/roles/AUTHOR`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (roleRes.ok) {
      const role = await roleRes.json()
      // Get the new user's ID from Location header
      const location   = createRes.headers.get('location') ?? ''
      const kcUserId   = location.split('/').pop() ?? ''

      await fetch(`${KC_URL}/admin/realms/${KC_REALM}/users/${kcUserId}/role-mappings/realm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify([{ id: role.id, name: role.name }]),
      })
    }

    // Get a JWT for the newly created user via ROPC
    const tokenRes = await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id:  KC_CLIENT,
        username:   email,
        password,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      throw new Error('Failed to obtain token for new user')
    }

    return NextResponse.json({ token: tokenData.access_token as string })
  } catch (err) {
    console.error('[register]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Registration failed' },
      { status: 500 },
    )
  }
}
