// Sentry init for the Node.js server runtime. Imported only when a DSN is set (see instrumentation.ts), so it never
// runs in a dormant build. Privacy first: no PII is sent, and traces are sampled lightly to keep cost down.
import * as Sentry from '@sentry/nextjs'
import { env } from '@/lib/env'

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  environment: env.NEXT_PUBLIC_APP_ENV,
  // Errors only at launch: performance tracing is off, so no Supabase query-string values (user ids, phone) ever
  // reach Sentry via trace spans. Turn this up only after adding beforeSend URL scrubbing.
  tracesSampleRate: 0,
})
