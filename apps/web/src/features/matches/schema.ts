import { z } from 'zod'

// Shape of the JSON published by the legacy ingest (scripts/update.mjs → data/league.json).
// Validated at the boundary so a bad upstream file can never crash a page.
export const fixtureSchema = z.object({
  id: z.number(),
  t: z.number(), // kick-off, unix seconds
  st: z.string(), // status short code (NS, 1H, HT, 2H, FT…)
  el: z.number().nullable().optional(),
  r: z.string(), // round label from API-Football
  h: z.number(), // home team api id
  a: z.number(), // away team api id
  gh: z.number().nullable(),
  ga: z.number().nullable(),
  v: z.string().optional().default(''),
  dm: z.boolean().optional(), // demo match (staging only): labelled in the UI
})

export const standingRowSchema = z.object({
  rank: z.number(),
  team: z.number(),
  pts: z.number(),
  gd: z.number(),
  form: z.string().default(''),
  grp: z.string().default(''),
  desc: z.string().default(''),
  p: z.number(),
  w: z.number(),
  d: z.number(),
  l: z.number(),
  gf: z.number(),
  ga: z.number(),
})

export const leagueSchema = z.object({
  league: z.object({ id: z.number(), season: z.number() }),
  teams: z.record(z.string(), z.object({ name: z.string(), logo: z.string().optional() })),
  fixtures: z.array(fixtureSchema),
  standings: z.array(z.array(standingRowSchema)),
  have: z.array(z.number()).default([]),
})

/** One match's events and lineups (legacy data/fx/<id>.json, Postgres fixture_details). */
export type FixtureDetail = {
  ev: { m: number; x: number; team: number; p: string; as: string; type: string; det: string }[]
  lu: {
    team: number
    f: string
    coach: string
    xi: { n: number | null; p: string; pos: string; g: string | null }[]
    sub: { n: number | null; p: string; pos: string }[]
  }[]
}

export type Fixture = z.infer<typeof fixtureSchema>
export type StandingRow = z.infer<typeof standingRowSchema>
export type League = z.infer<typeof leagueSchema>

export const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'])
export const DONE_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO'])
/** Games not being played at their kick-off time (postponed, cancelled, abandoned, undated, awarded, walkover): never live. */
export const NOT_PLAYED_STATUSES = new Set(['PST', 'CANC', 'ABD', 'TBD', 'AWD', 'WO'])
