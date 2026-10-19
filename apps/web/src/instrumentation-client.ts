// Sentry init for the browser (Next.js client instrumentation). Dormant without a DSN: init is skipped, so no events
// are sent. No Session Replay (privacy + cost); no PII. Errors and a light trace sample only.
import * as Sentry from '@sentry/nextjs'
import { env } from '@/lib/env'

if (env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env.NEXT_PUBLIC_APP_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}

// Lets Sentry tie client-side navigations to their traces (App Router). No-op until init above has run.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
