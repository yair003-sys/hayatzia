// Sentry init for the Edge runtime (proxy.ts, edge routes). Imported only when a DSN is set (instrumentation.ts).
import * as Sentry from '@sentry/nextjs'
import { env } from '@/lib/env'

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  environment: env.NEXT_PUBLIC_APP_ENV,
  tracesSampleRate: 0.1,
  enableLogs: false,
})
