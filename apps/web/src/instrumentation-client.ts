// Sentry init for the browser (Next.js client instrumentation). The SDK is imported statically (onRouterTransitionStart
// must be a static export), but without a DSN init is skipped, so it stays inert — no handlers, no events. No Session
// Replay (privacy + cost); errors only (no performance spans); PII off by default.
import * as Sentry from '@sentry/nextjs'
import { env } from '@/lib/env'

if (env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env.NEXT_PUBLIC_APP_ENV,
    tracesSampleRate: 0, // errors only; no performance spans (privacy + cost)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}

// Lets Sentry tie client-side navigations to their traces (App Router). No-op until init above has run.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
