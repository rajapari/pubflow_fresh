const KC_URL   = process.env.KEYCLOAK_URL   ?? 'http://localhost:8080'
const KC_REALM = process.env.KEYCLOAK_REALM ?? 'pubflow'

async function adminToken(): Promise<string> {
  const res = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id:  'admin-cli',
      username:   'admin',
      password:   process.env.KEYCLOAK_ADMIN_PASSWORD ?? '',
    }),
  })
  if (!res.ok) throw new Error(`Keycloak admin token failed: ${res.status}`)
  const d = await res.json() as { access_token: string }
  return d.access_token
}

export async function createKeycloakUser(email: string): Promise<string> {
  const token = await adminToken()

  const createRes = await fetch(`${KC_URL}/admin/realms/${KC_REALM}/users`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      username:        email,
      email,
      emailVerified:   false,
      enabled:         true,
      requiredActions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
    }),
  })

  if (createRes.status === 409) throw new Error('User already exists in Keycloak')
  if (!createRes.ok) throw new Error(`Keycloak user creation failed: ${createRes.status}`)

  const location  = createRes.headers.get('Location')
  const keycloakId = location?.split('/').pop()
  if (!keycloakId) throw new Error('Keycloak did not return user ID')

  // Send set-password + verify-email invitation
  await fetch(`${KC_URL}/admin/realms/${KC_REALM}/users/${keycloakId}/execute-actions-email`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(['UPDATE_PASSWORD', 'VERIFY_EMAIL']),
  })

  return keycloakId
}

export async function deleteKeycloakUser(keycloakId: string): Promise<void> {
  const token = await adminToken()
  await fetch(`${KC_URL}/admin/realms/${KC_REALM}/users/${keycloakId}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}
