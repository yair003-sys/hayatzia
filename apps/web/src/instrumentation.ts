// Sentry error monitoring — server/edge entry (Next.js `instrumentation`).
// Dormant by default: with no NEXT_PUBLIC_SENTRY_DSN set, nothing from @sentry/nextjs (and its OpenTelemetry deps) is
// ever imported, so a dormant build carries zero Sentry runtime and cannot hit the Next 16 + Turbopack OTel issues.
// It lights up the moment the DSN env var is set (owner adds it in Vercel).
import type { Instrumentation } from 'next'
import { env } from '@/lib/env'

export async function register(): Promise<void> {
  if (!env.NEXT_PUBLIC_SENTRY_DSN) return
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  else if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}

// Reports errors thrown while rendering Server Components / Route Handlers to Sentry. Loaded lazily so the SDK is pulled
// in only when monitoring is on.
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!env.NEXT_PUBLIC_SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
