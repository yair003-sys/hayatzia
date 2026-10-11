import { defineConfig, devices } from '@playwright/test'

// Runs against a local production build only: never against a deployed environment.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3000', locale: 'he-IL' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: { command: 'npm run start -- -p 3000', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI },
})
