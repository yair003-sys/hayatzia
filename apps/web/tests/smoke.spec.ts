import { expect, test } from '@playwright/test'

test('welcome page is Hebrew and right-to-left', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('רק אוהדים')
})

test('a tab URL loads directly and stays selected after refresh', async ({ page }) => {
  await page.goto('/square')
  const current = page.getByRole('link', { name: 'הכיכר' })
  await expect(current).toHaveAttribute('aria-current', 'page')
  await page.reload()
  await expect(current).toHaveAttribute('aria-current', 'page')
})

test('non-production builds show the test environment banner', async ({ page }) => {
  await page.goto('/stand')
  await expect(page.getByRole('status')).toContainText('סביבת בדיקות')
})
