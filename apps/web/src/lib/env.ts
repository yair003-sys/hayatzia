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
  },
  client: {
    NEXT_PUBLIC_APP_ENV: z.enum(APP_ENVS).default('local'),
    NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
    /** Phone (SMS code) sign-in. Off until an SMS provider is connected in Supabase Auth. */
    NEXT_PUBLIC_PHONE_AUTH: z.enum(['on', 'off']).default('off'),
    /** Web Push (VAPID) public key. Safe to expose. */
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(20).optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // The Vercel ↔ Supabase integration names it ANON_KEY; new keys are "publishable". Accept both.
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_PHONE_AUTH: process.env.NEXT_PUBLIC_PHONE_AUTH,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
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
