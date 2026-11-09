import { test, expect } from '@playwright/test'

test('real journal portal renders', async ({ page }) => {
  await page.goto('/demo-journal')
  await expect(page.locator('body')).not.toContainText('Journal not found', { timeout: 15000 })
  await expect(page.locator('h1')).toBeVisible()
})

test('nonexistent journal shows "not found", not a generic error', async ({ page }) => {
  await page.goto('/this-tenant-does-not-exist-xyz')
  await expect(page.getByText('Journal not found.')).toBeVisible({ timeout: 15000 })
})

test('a network failure shows a distinct "couldn\'t load" state, not "not found"', async ({ page }) => {
  await page.route('**/trpc/portal.journal**', (route) => route.abort('failed'))
  await page.goto('/demo-journal')
  await expect(page.getByText(/couldn.t load this journal/i)).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Journal not found.')).not.toBeVisible()
})
