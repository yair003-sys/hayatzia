// Sentry init for the Edge runtime (proxy.ts, edge routes). Imported only when a DSN is set (instrumentation.ts).
import * as Sentry from '@sentry/nextjs'
import { env } from '@/lib/env'

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  environment: env.NEXT_PUBLIC_APP_ENV,
  // Errors only at launch: performance tracing is off, so no Supabase query-string values (user ids, phone) ever
  // reach Sentry via trace spans. Turn this up only after adding beforeSend URL scrubbing.
  tracesSampleRate: 0,
})
