import { expect, test } from '@playwright/test'

test('welcome page is Hebrew and right-to-left', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('רק אוהדים')
})

for (const [path, title] of [
  ['/terms', 'תנאי שימוש'],
  ['/privacy', 'מדיניות פרטיות'],
  ['/accessibility', 'הצהרת נגישות'],
] as const) {
  test(`legal page ${path} is public, dated and marked as a draft`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page.getByText('עודכן לאחרונה: 15 באוקטובר 2026')).toBeVisible()
    await expect(page.getByText('טיוטה – בבדיקה משפטית')).toBeVisible()
    const legal = page.getByRole('navigation', { name: 'מידע משפטי' })
    await expect(legal.getByRole('link', { name: 'פרטיות' })).toHaveAttribute('href', '/privacy')
  })
}

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

for (const path of ['/', '/login', '/stand', '/square', '/terms'] as const) {
  test(`page ${path} is never wider than the phone screen`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth - clientWidth).toBeLessThanOrEqual(1)
    await expect(page.getByText(/^באג פריסה/)).toHaveCount(0)
  })
}

test('non-production builds show the test environment banner', async ({ page }) => {
  await page.goto('/stand')
  await expect(page.getByRole('status')).toContainText('סביבת בדיקות')
})

// Stadium redesign (2026-10-17): the opt-in home must obey the owner's layout rule too. The onefan_design=stadium
// cookie selects it; at 375px it may not be wider than the screen or trip the OverflowGuard. (In CI there is no
// Supabase, so this exercises the signed-out stadium shell — the backdrop, the wordmark and the fixed, clipped
// floodlight layer. To check it with real data, sign in on a preview, turn "עיצוב חדש (ניסיוני)" on in הכרטיס שלי,
// and reload /stand at phone width.)
test('the stadium home fits the phone screen at 375px', async ({ page, context }) => {
  await context.addCookies([{ name: 'onefan_design', value: 'stadium', url: 'http://127.0.0.1:3000' }])
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/stand')
  await page.waitForLoadState('networkidle')
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth - clientWidth).toBeLessThanOrEqual(1)
  await expect(page.getByText(/^באג פריסה/)).toHaveCount(0)
})
