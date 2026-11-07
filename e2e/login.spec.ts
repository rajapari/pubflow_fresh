import { test, expect } from '@playwright/test'

// Real browser click-through: types into the actual form fields, clicks
// the actual submit button, and asserts on actually-rendered DOM — the one
// thing scripts/e2e-pressure-test.mjs (raw API calls) never exercises.
test('editor logs in through the UI and lands on the dashboard', async ({ page }) => {
  await page.goto('/login')

  await page.locator('#email').fill('editor@demo-journal.local')
  await page.locator('#password').fill('Editor@Demo2025!')
  // There are two "sign in"-ish buttons on this page (SSO + the actual
  // email/password submit) — target the real submit button specifically.
  await page.locator('button[type="submit"]').click()

  await page.waitForURL('**/dashboard', { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
})

test('wrong password shows an error and does not navigate', async ({ page }) => {
  await page.goto('/login')

  await page.locator('#email').fill('editor@demo-journal.local')
  await page.locator('#password').fill('definitely-wrong')
  await page.locator('button[type="submit"]').click()

  await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/login/)
})

test('submissions list page renders after login', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#email').fill('editor@demo-journal.local')
  await page.locator('#password').fill('Editor@Demo2025!')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 10_000 })

  await page.goto('/dashboard/submissions')
  // Not asserting specific row content (data-dependent) — asserting the
  // authenticated page actually rendered instead of bouncing to /login,
  // which is exactly the kind of thing API-level testing can't see.
  await expect(page).toHaveURL(/\/dashboard\/submissions/)
  await expect(page.locator('body')).not.toContainText('Sign in to PubFlow')
})
