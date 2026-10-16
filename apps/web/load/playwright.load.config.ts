import { defineConfig } from '@playwright/test'

// LOAD TEST ONLY: the UI consistency checks of web-load-local.yml, at phone size, against the LOCAL build that runs
// on the LOCAL Supabase inside the CI runner (never a deployed environment). Started by the workflow (no webServer).
const app = process.env.APP_URL ?? 'http://127.0.0.1:3000'
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(app)) throw new Error(`refusing: APP_URL must be the local build, got ${app}`)

export default defineConfig({
  testDir: '.',
  testMatch: 'consistency.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list'], ['json', { outputFile: `${process.env.OUT_DIR ?? '.'}/playwright-${process.env.PHASE ?? 'after'}.json` }]],
  outputDir: `${process.env.OUT_DIR ?? '.'}/playwright-${process.env.PHASE ?? 'after'}`,
  use: {
    baseURL: app,
    locale: 'he-IL',
    browserName: 'chromium',
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
})
