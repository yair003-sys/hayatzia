import { env } from './env'

/**
 * Launch feature flags (owner 2026-10-18).
 *
 * Everything here is built, tested and live in the database; it is only hidden from fans at launch so the
 * first community sees one clear daily loop, and turned on later one feature at a time. Each flag is off by
 * default and switched on by setting its env var to 'on' in Vercel — no code change needed.
 *
 * Reading from `env` keeps a single source of truth and the same value on the server and the client, so a
 * hidden area is hidden both in the navigation and on its own page.
 */
export const features = {
  /** Rides/trips to matches, plus the identity verification and gender settings that exist only for them. */
  rides: env.NEXT_PUBLIC_FEATURE_RIDES === 'on',
  /** Fans' market (buy/sell/trade listings). */
  market: env.NEXT_PUBLIC_FEATURE_MARKET === 'on',
  /** Fan events board. */
  events: env.NEXT_PUBLIC_FEATURE_EVENTS === 'on',
  /** Fan campaigns (donations / goal funding). Off until a payment provider and legal sign-off are in place. */
  campaigns: env.NEXT_PUBLIC_FEATURE_CAMPAIGNS === 'on',
} as const

export type FeatureName = keyof typeof features
