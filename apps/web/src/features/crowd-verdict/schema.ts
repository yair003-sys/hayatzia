import { z } from 'zod'

// Crowd verdict (דעת הקהל): live polls in the match room. Rules live in the database
// (migrations 20261012040000_crowd_verdict.sql, 20261012041000_crowd_triggers.sql); this file is pure.

export const POLL_KINDS = ['penalty', 'red', 'offside', 'var', 'card', 'goal', 'sub60', 'sub_event', 'motm'] as const
export type PollKind = (typeof POLL_KINDS)[number]
export type Group = 'h' | 'a' | 'n'
export type Row = 'o' | 'i'

const optionSchema = z.object({ id: z.string().min(1).max(40), emoji: z.string(), label: z.string() })
export type PollOption = z.infer<typeof optionSchema>

export type Poll = {
  id: string
  fixtureId: number
  kind: PollKind
  question: string
  options: PollOption[]
  optionsIn: PollOption[] | null
  source: 'chat' | 'event' | 'schedule'
  scope: string | null
  opensAt: string
  closesAt: string
  summary: string | null
}
export type Tally = { row: Row; option: string; group: Group; n: number }
export type MyVote = { option: string; optionIn: string | null }

const pollRowSchema = z.object({
  id: z.string(),
  fixture_id: z.coerce.number(),
  kind: z.enum(POLL_KINDS),
  question: z.string(),
  options: z.array(optionSchema),
  options_in: z.array(optionSchema).nullable(),
  source: z.enum(['chat', 'event', 'schedule']),
  voter_scope: z.string().nullable(),
  opens_at: z.string(),
  closes_at: z.string(),
  summary: z.string().nullable(),
})

/** A poll from a database row or a 'poll' broadcast (same field names). */
export function pollFromRow(row: unknown): Poll | null {
  const r = pollRowSchema.safeParse(row)
  if (!r.success) return null
  const p = r.data
  return {
    id: p.id,
    fixtureId: p.fixture_id,
    kind: p.kind,
    question: p.question,
    options: p.options,
    optionsIn: p.options_in,
    source: p.source,
    scope: p.voter_scope,
    opensAt: new Date(p.opens_at).toISOString(),
    closesAt: new Date(p.closes_at).toISOString(),
    summary: p.summary,
  }
}

const tallyWireSchema = z.object({
  r: z.enum(['o', 'i']),
  o: z.string(),
  g: z.enum(['h', 'a', 'n']),
  n: z.number().int().nonnegative(),
})
const tallyBroadcastSchema = z.object({ poll_id: z.string(), tallies: z.array(tallyWireSchema) })
const closedBroadcastSchema = z.object({ id: z.string(), summary: z.string(), tallies: z.array(tallyWireSchema) })

const fromWire = (t: z.infer<typeof tallyWireSchema>): Tally => ({ row: t.r, option: t.o, group: t.g, n: t.n })

export function talliesFromBroadcast(payload: unknown): { pollId: string; tallies: Tally[] } | null {
  const r = tallyBroadcastSchema.safeParse(payload)
  return r.success ? { pollId: r.data.poll_id, tallies: r.data.tallies.map(fromWire) } : null
}

export function closedFromBroadcast(payload: unknown): { pollId: string; summary: string; tallies: Tally[] } | null {
  const r = closedBroadcastSchema.safeParse(payload)
  return r.success ? { pollId: r.data.id, summary: r.data.summary, tallies: r.data.tallies.map(fromWire) } : null
}

/** Whole percentages that add up to 100 (largest remainder); all zeros when nobody voted. */
export function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return counts.map(() => 0)
  const raw = counts.map((c) => (c * 100) / total)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    out[i]! += 1
    left -= 1
  }
  return out
}

export function resultsFor(poll: Poll, tallies: Tally[], row: Row, group?: Group): { option: string; n: number; pct: number }[] {
  const opts = row === 'i' ? (poll.optionsIn ?? []) : poll.options
  const counts = opts.map((o) =>
    tallies
      .filter((t) => t.row === row && t.option === o.id && (!group || t.group === group))
      .reduce((a, t) => a + t.n, 0),
  )
  const pct = percentages(counts)
  return opts.map((o, i) => ({ option: o.id, n: counts[i]!, pct: pct[i]! }))
}

export function pollState(poll: Poll, nowMs: number): 'open' | 'closed' {
  return poll.summary === null && nowMs < Date.parse(poll.closesAt) ? 'open' : 'closed'
}

export function anyOpen(polls: Poll[], nowMs: number): boolean {
  return polls.some((p) => pollState(p, nowMs) === 'open')
}

export function canVote(poll: Poll, myTeamId: string, nowMs: number): boolean {
  return pollState(poll, nowMs) === 'open' && (poll.scope === null || poll.scope === myTeamId)
}

/** Results are hidden only from a fan who can still vote and has not voted yet. */
export function showResults(poll: Poll, mine: MyVote | null, myTeamId: string, nowMs: number): boolean {
  return mine !== null || !canVote(poll, myTeamId, nowMs)
}

export const voteSchema = z.object({
  pollId: z.uuid(),
  option: z.string().min(1).max(40),
  optionIn: z.string().min(1).max(40).optional(),
})
export const tickSchema = z.object({ fixtureId: z.number().int() })

/** Hebrew message for a database error from voting. */
export function crowdErrorHe(message: string): string {
  if (message.includes('poll_closed')) return 'ההצבעה נסגרה'
  if (message.includes('not_allowed')) return 'ההצבעה הזאת רק לאוהדי הקבוצה'
  if (message.includes('bad_option')) return 'בחירה לא תקינה'
  return 'ההצבעה לא נקלטה'
}

export const KEEP_POLLS = 20

/** New or updated polls into the list: one per id, in time order, the latest KEEP_POLLS. */
export function mergePolls(cur: Poll[], incoming: Poll[]): Poll[] {
  const byId = new Map(cur.map((p) => [p.id, p]))
  for (const p of incoming) byId.set(p.id, p)
  return [...byId.values()].sort((a, b) => a.opensAt.localeCompare(b.opensAt)).slice(-KEEP_POLLS)
}
