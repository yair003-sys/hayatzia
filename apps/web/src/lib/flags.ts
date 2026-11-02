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
  /**
   * Rides/trips to matches, plus the identity verification and gender settings that exist only for them.
   * Launched 2026-11-02 (fans asked for it): on by default now. Set NEXT_PUBLIC_FEATURE_RIDES='off' in Vercel to
   * hide it again. Identity verification is still off (no provider yet), so the rides screens carry an "identity not
   * verified — ride at your own responsibility" warning.
   */
  rides: env.NEXT_PUBLIC_FEATURE_RIDES !== 'off',
  /** Fans' market (buy/sell/trade listings). */
  market: env.NEXT_PUBLIC_FEATURE_MARKET === 'on',
  /** Fan events board. */
  events: env.NEXT_PUBLIC_FEATURE_EVENTS === 'on',
  /** Fan campaigns (donations / goal funding). Off until a payment provider and legal sign-off are in place. */
  campaigns: env.NEXT_PUBLIC_FEATURE_CAMPAIGNS === 'on',
  /** Language switcher (i18n). Off for the Israeli launch (Hebrew only). */
  i18n: env.NEXT_PUBLIC_FEATURE_I18N === 'on',
} as const

export type FeatureName = keyof typeof features
