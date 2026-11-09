import { test, expect } from '@playwright/test'

// Real browser click-through of the actual (only) login path: click Sign
// In, get redirected to Keycloak's own hosted login page (not an in-app
// form — pubflow-web has directAccessGrantsEnabled: false, the password
// grant is rejected server-side even if a form existed), authenticate
// there, and land back on an authenticated page via the real PKCE
// authorization-code exchange. scripts/e2e-pressure-test.mjs (raw API
// calls via a separate test-only client) never exercises any of this —
// it's a different layer entirely.
test('editor logs in via the real SSO redirect and lands on the dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /sign in/i }).click()

  await page.waitForURL('**/realms/pubflow/protocol/openid-connect/**', { timeout: 10_000 })
  await page.locator('#username, input[name="username"]').fill('editor@demo-journal.local')
  await page.locator('#password, input[name="password"]').fill('Editor@Demo2025!')
  await page.locator('#kc-login, button[type="submit"], input[type="submit"]').first().click()

  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
})

test('wrong password on Keycloak\'s own login page shows an error and does not authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/realms/pubflow/protocol/openid-connect/**', { timeout: 10_000 })

  await page.locator('#username, input[name="username"]').fill('editor@demo-journal.local')
  await page.locator('#password, input[name="password"]').fill('definitely-wrong')
  await page.locator('#kc-login, button[type="submit"], input[type="submit"]').first().click()

  // Keycloak re-renders its own login page with an error — still there,
  // never redirected back to the app. Its failure-reload URL is
  // /login-actions/authenticate, not /protocol/openid-connect/... like the
  // initial redirect — matching "realms/pubflow" broadly just confirms
  // we're still on Keycloak's own domain, not bounced back to the app.
  await expect(page).toHaveURL(/localhost:8080\/realms\/pubflow\//)
  await expect(page.locator('#input-error, .kc-feedback-text, .alert-error')).toBeVisible({ timeout: 10_000 })
})

test('submissions list page renders after a real login', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/realms/pubflow/protocol/openid-connect/**', { timeout: 10_000 })
  await page.locator('#username, input[name="username"]').fill('editor@demo-journal.local')
  await page.locator('#password, input[name="password"]').fill('Editor@Demo2025!')
  await page.locator('#kc-login, button[type="submit"], input[type="submit"]').first().click()
  await page.waitForURL('**/dashboard', { timeout: 15_000 })

  await page.goto('/dashboard/submissions')
  // Not asserting specific row content (data-dependent) — asserting the
  // authenticated page actually rendered instead of bouncing to /login,
  // which is exactly the kind of thing API-level testing can't see.
  await expect(page).toHaveURL(/\/dashboard\/submissions/)
  await expect(page.locator('body')).not.toContainText('Sign in to PubFlow')
})

test('the password grant is rejected even if someone posts directly to Keycloak', async ({ request }) => {
  // Defense in depth: confirms the *server-side* Keycloak config, not just
  // that the UI no longer offers a form. This is the actual security
  // boundary — a form existing or not is cosmetic if the grant still works.
  const res = await request.post('http://localhost:8080/realms/pubflow/protocol/openid-connect/token', {
    form: { grant_type: 'password', client_id: 'pubflow-web', username: 'editor@demo-journal.local', password: 'Editor@Demo2025!' },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('unauthorized_client')
})
