import { expect, test } from '@playwright/test'

test('welcome page is Hebrew and right-to-left', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('רק אוהדים')
})

test('first visit shows the intro once; skipping it remembers', async ({ page }) => {
  await page.goto('/login')
  const intro = page.getByRole('dialog', { name: 'ברוכים הבאים ל-onefan' })
  await expect(intro).toBeVisible()
  await page.getByRole('button', { name: 'בוא נכיר' }).click()
  await expect(page.getByRole('button', { name: 'הבא' })).toBeVisible()
  await page.getByRole('button', { name: 'דלג' }).click()
  await expect(intro).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('אוהד אחד, חשבון אחד')
  await expect(intro).toBeHidden()
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
