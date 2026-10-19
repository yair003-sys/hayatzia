import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

// The only place that reads process.env. Build fails on a missing or invalid value.
export const APP_ENVS = ['local', 'preview', 'production'] as const
export type AppEnv = (typeof APP_ENVS)[number]

/** Supabase project refs. Production is reachable only from the production deployment (owner's rule). */
export const SUPABASE_REFS = { staging: 'yblzcgetkfbdwsfogkqp', production: 'loaqhisfhafjbrmtygrp' } as const

export const env = createEnv({
  server: {
    /** Secret key of this environment's Supabase project. Server only: used to send notifications. */
    SUPABASE_SECRET_KEY: z.string().min(20).optional(),
    /** Web Push (VAPID) private key. Server only. */
    VAPID_PRIVATE_KEY: z.string().min(20).optional(),
    /** Shared secret the ingest workflow sends to POST /api/alerts/dispatch. Server only. Unset → dispatch refuses. */
    ALERTS_SECRET: z.string().min(20).optional(),
    /** API-Football key for the every-minute live tick. Server only. Unset → /api/live/tick no-ops (safe dormant). */
    API_FOOTBALL_KEY: z.string().min(1).optional(),
    /** Secret Vercel Cron auto-sends as `Authorization: Bearer <CRON_SECRET>`. Server only. Unset → only ALERTS_SECRET admits the tick. */
    CRON_SECRET: z.string().min(16).optional(),
    /** API-Football season (the year a season starts). Server only. Unset → computed from the date (live.ts currentSeason). */
    SEASON: z.coerce.number().int().positive().optional(),
    /** API-Football league id. Server only. Unset → 383 (Ligat Ha'Al), the same default as the legacy updater. */
    LEAGUE: z.coerce.number().int().positive().optional(),
    /**
     * Identity verification provider for rides. Unset: the mock (demo) provider outside production, none in
     * production. 'mock' is refused in production (features/verification/server/select-provider.ts).
     */
    VERIFICATION_PROVIDER: z.enum(['mock']).optional(),
    /** Secret that signs the provider's webhook. Server only. Optional outside production (the mock signs in-process). */
    VERIFICATION_WEBHOOK_SECRET: z.string().min(32).optional(),
    /** Key of the ID-number fingerprint (HMAC). Server only, never rotated once used. Required in production at runtime. */
    VERIFICATION_FINGERPRINT_SECRET: z.string().min(32).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_ENV: z.enum(APP_ENVS).default('local'),
    NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
    /** Phone (SMS code) sign-in. Off until an SMS provider is connected in Supabase Auth. */
    NEXT_PUBLIC_PHONE_AUTH: z.enum(['on', 'off']).default('off'),
    /** Web Push (VAPID) public key. Safe to expose. */
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(20).optional(),
    /** Sentry error-monitoring DSN (safe to expose). Unset → dormant: the server loads no Sentry/OTel code at all, and
     *  the client ships the SDK inert (never initialised, no events). */
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    // Launch scope (owner 2026-10-18): these areas are built and tested but hidden at launch, turned on
    // one by one once a community is live. Each defaults 'off'; set to 'on' in Vercel to reveal it.
    /** Rides/trips, with the identity verification and gender settings that exist only for them. */
    NEXT_PUBLIC_FEATURE_RIDES: z.enum(['on', 'off']).default('off'),
    /** Fans' market (buy/sell/trade listings). */
    NEXT_PUBLIC_FEATURE_MARKET: z.enum(['on', 'off']).default('off'),
    /** Fan events board. */
    NEXT_PUBLIC_FEATURE_EVENTS: z.enum(['on', 'off']).default('off'),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // The Vercel ↔ Supabase integration names it ANON_KEY; new keys are "publishable". Accept both.
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_PHONE_AUTH: process.env.NEXT_PUBLIC_PHONE_AUTH,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_FEATURE_RIDES: process.env.NEXT_PUBLIC_FEATURE_RIDES,
    NEXT_PUBLIC_FEATURE_MARKET: process.env.NEXT_PUBLIC_FEATURE_MARKET,
    NEXT_PUBLIC_FEATURE_EVENTS: process.env.NEXT_PUBLIC_FEATURE_EVENTS,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    ALERTS_SECRET: process.env.ALERTS_SECRET,
    API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    SEASON: process.env.SEASON,
    LEAGUE: process.env.LEAGUE,
    VERIFICATION_PROVIDER: process.env.VERIFICATION_PROVIDER,
    VERIFICATION_WEBHOOK_SECRET: process.env.VERIFICATION_WEBHOOK_SECRET,
    VERIFICATION_FINGERPRINT_SECRET: process.env.VERIFICATION_FINGERPRINT_SECRET,
  },
  emptyStringAsUndefined: true,
})

/** Throws if a non-production build points at the production project. */
export function assertEnvironmentSeparation(appEnv: AppEnv, supabaseUrl: string | undefined): void {
  if (appEnv !== 'production' && supabaseUrl?.includes(SUPABASE_REFS.production)) {
    throw new Error(`Refusing to use the production database from a "${appEnv}" build.`)
  }
}

assertEnvironmentSeparation(env.NEXT_PUBLIC_APP_ENV, env.NEXT_PUBLIC_SUPABASE_URL)
