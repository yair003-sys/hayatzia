import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

// The only place that reads process.env. Build fails on a missing or invalid value.
// Server-only secrets (Supabase secret key, DATABASE_URL, INGEST_SECRET) are added in P1.
export const APP_ENVS = ['local', 'preview', 'production'] as const
export type AppEnv = (typeof APP_ENVS)[number]

export const env = createEnv({
  server: {},
  client: {
    NEXT_PUBLIC_APP_ENV: z.enum(APP_ENVS).default('local'),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  },
  emptyStringAsUndefined: true,
})
