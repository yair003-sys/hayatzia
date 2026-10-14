import { z } from 'zod'
import { DONE_STATUSES, NOT_PLAYED_STATUSES } from '@/features/matches/schema'
import { positionGroup } from '@/features/ratings/schema'

// Fan lineup ("ההרכב של האוהדים"). Rules live in the database (20261014120000_fan_lineups.sql): own club's match,
// before kick-off, 11 different players of the club. This file is the UI side: where the 11 slots sit on the pitch,
// the fans' XI from the counts, and the builder's moves. Pure, no React.

export const FORMATIONS = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2'] as const
export type Formation = (typeof FORMATIONS)[number]
export type Role = 'GK' | 'DEF' | 'MID' | 'FWD'
/** `x`: percent from the left; `y`: percent from the bottom (goalkeeper at the bottom), like `pitchSpots`. */
/** `w`: the share of the pitch width (%) each player of that line has, for the name label. */
export type SlotSpot = { slot: number; role: Role; x: number; y: number; w: number }
/** One entry per slot (0..10), a player id or empty. */
export type XI = (string | null)[]

export const XI_SIZE = 11
const GK_Y = 8
const TOP_Y = 88
/** Keep the wide players' names inside the pitch. */
const SIDE_X = 8
const round2 = (v: number) => Math.round(v * 100) / 100

export const isFormation = (v: unknown): v is Formation => typeof v === 'string' && (FORMATIONS as readonly string[]).includes(v)

/**
 * The 11 slots of a formation. Slot 0 is the goalkeeper, then line by line from defence to attack, each line from
 * left to right (x within 8–92). NEVER reorder: the database counts picks per (formation, slot), so a slot's meaning is permanent.
 */
export function formationSlots(f: Formation): SlotSpot[] {
  const lines = [1, ...f.split('-').map(Number)]
  const out: SlotSpot[] = []
  lines.forEach((count, row) => {
    const role: Role = row === 0 ? 'GK' : row === 1 ? 'DEF' : row === lines.length - 1 ? 'FWD' : 'MID'
    const y = GK_Y + (row * (TOP_Y - GK_Y)) / (lines.length - 1)
    const w = round2((100 - 2 * SIDE_X) / count)
    for (let col = 0; col < count; col++) out.push({ slot: out.length, role, x: round2(SIDE_X + ((col + 0.5) / count) * (100 - 2 * SIDE_X)), y: round2(y), w })
  })
  return out
}

export const ROLE_HE: Record<Role, string> = { GK: 'שוער', DEF: 'הגנה', MID: 'קישור', FWD: 'התקפה' }
/** The squad picker's tabs (the groups' plural names). */
export const GROUP_HE: Record<Role, string> = { GK: 'שוערים', DEF: 'הגנה', MID: 'קישור', FWD: 'התקפה' }
export const ROLES: readonly Role[] = ['GK', 'DEF', 'MID', 'FWD']
/** The word on an empty slot. */
export const SLOT_HE: Record<Role, string> = { GK: 'שוער', DEF: 'מגן', MID: 'קשר', FWD: 'חלוץ' }

const ROLE_BY_GROUP: (Role | null)[] = ['GK', 'DEF', 'MID', 'FWD', null]

/** Squad position code → line, by the app's one position grouping (ratings' positionGroup); null for staff. */
export function roleOf(position: string): Role | null {
  return ROLE_BY_GROUP[positionGroup(position).order] ?? null
}

/** Widest a slot's name may be (% of the pitch) so neighbours on a line never touch: ≤ 20%, a gap kept. */
export const labelWidth = (s: SlotSpot) => Math.min(20, round2(s.w - 1.5))

// ── the fans' XI ──────────────────────────────────────────────────────────────────────────
export type Tally = { formation: string; slot: number; player_id: string; picks: number }
export type Totals = { fans: number; formations: Record<string, number> }
export type FansSlot = { slot: number; playerId: string; picks: number; pct: number }
export type FansXI = { formation: Formation; fans: number; formationPct: number; slots: (FansSlot | null)[] }

/** The totals row's `formations` jsonb → known formations with a positive count (bad entries dropped). */
export function parseFormations(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(v)) if (isFormation(k) && typeof n === 'number' && Number.isInteger(n) && n > 0) out[k] = n
  return out
}

/** The formation most fans chose (ties: the order of FORMATIONS); null when none. */
export function topFormation(formations: Record<string, number>): { formation: Formation; count: number } | null {
  let top: { formation: Formation; count: number } | null = null
  for (const f of FORMATIONS) {
    const n = formations[f] ?? 0
    if (n > (top?.count ?? 0)) top = { formation: f, count: n }
  }
  return top
}

export const pct = (picks: number, fans: number) => (fans > 0 ? Math.round((picks * 100) / fans) : 0)

/**
 * The fans' most-wanted XI: the most-picked formation (ties: the order of FORMATIONS), then slots filled greedily by
 * picks, highest first, never using a player twice (ties: lower slot, then player id). Percent = picks / fans who
 * saved a lineup. `known` drops players no longer in the squad. Null when nobody saved one.
 */
export function fansXI(tallies: Tally[], totals: Totals | null, known?: Set<string>): FansXI | null {
  if (!totals || totals.fans <= 0) return null
  const top = topFormation(totals.formations)
  if (!top) return null
  const { formation, count: best } = top
  const rows = tallies
    .filter((t) => t.formation === formation && t.picks > 0 && t.slot >= 0 && t.slot < XI_SIZE && (!known || known.has(t.player_id)))
    .sort((a, b) => b.picks - a.picks || a.slot - b.slot || (a.player_id < b.player_id ? -1 : a.player_id > b.player_id ? 1 : 0))
  const slots: (FansSlot | null)[] = Array.from({ length: XI_SIZE }, () => null)
  const used = new Set<string>()
  for (const t of rows) {
    if (slots[t.slot] || used.has(t.player_id)) continue
    slots[t.slot] = { slot: t.slot, playerId: t.player_id, picks: t.picks, pct: pct(t.picks, totals.fans) }
    used.add(t.player_id)
  }
  return { formation, fans: totals.fans, formationPct: pct(best, totals.fans), slots }
}

// ── builder moves (all return a new XI) ───────────────────────────────────────────────────
export const emptyXI = (): XI => Array.from({ length: XI_SIZE }, () => null)

/**
 * Put a player in a slot. From the bench: whoever was there goes back to the bench. From another slot: the two swap
 * (an empty target just moves him).
 */
export function placeAt(xi: XI, slot: number, playerId: string): XI {
  const next = [...xi]
  const from = next.indexOf(playerId)
  const displaced = next[slot] ?? null
  next[slot] = playerId
  if (from >= 0 && from !== slot) next[from] = displaced
  return next
}

export function swapSlots(xi: XI, a: number, b: number): XI {
  const next = [...xi]
  next[a] = xi[b] ?? null
  next[b] = xi[a] ?? null
  return next
}

export function clearSlot(xi: XI, slot: number): XI {
  const next = [...xi]
  next[slot] = null
  return next
}

export type XIProblem = 'incomplete' | 'duplicate' | 'unknown'
export const XI_PROBLEM_HE: Record<XIProblem, string> = {
  incomplete: 'צריך 11 שחקנים בהרכב',
  duplicate: 'כל שחקן יכול להופיע בהרכב פעם אחת',
  unknown: 'אפשר לבחור רק שחקנים של הקבוצה שלך',
}

/** Same checks as the database, so the save button can explain itself before a round trip. */
export function checkXI(xi: XI, squad: Set<string>): XIProblem | null {
  if (xi.length !== XI_SIZE || xi.some((p) => !p)) return 'incomplete'
  const ids = xi as string[]
  if (new Set(ids).size !== XI_SIZE) return 'duplicate'
  if (ids.some((p) => !squad.has(p))) return 'unknown'
  return null
}

export const toPayload = (xi: XI) => xi.map((playerId, slot) => ({ slot, playerId: playerId ?? '' }))

const savedSlotsSchema = z.array(z.object({ slot: z.number().int().min(0).max(XI_SIZE - 1), player_id: z.string().min(1) }))

/** The saved `slots` jsonb ([{slot, player_id}]) → XI; anything malformed reads as an empty XI. */
export function xiFromSaved(v: unknown): XI {
  const r = savedSlotsSchema.safeParse(v)
  const xi = emptyXI()
  if (!r.success) return xi
  for (const s of r.data) xi[s.slot] = s.player_id
  return xi
}

// ── server action input and errors ─────────────────────────────────────────────────────────
export const saveLineupSchema = z.object({
  fixtureId: z.number().int().positive(),
  formation: z.enum(FORMATIONS),
  slots: z
    .array(z.object({ slot: z.number().int().min(0).max(XI_SIZE - 1), playerId: z.string().regex(/^[a-z0-9]{2,8}_[a-z0-9]+$/) }))
    .length(XI_SIZE),
})
export type SaveLineupInput = z.infer<typeof saveLineupSchema>

/** The database's refusal (error.message) → what the fan reads. */
export function lineupErrorHe(message: string): string {
  if (message.includes('locked')) return 'ההרכב ננעל — המשחק כבר התחיל'
  if (message.includes('not_your_match')) return 'אפשר לבנות הרכב רק למשחק של הקבוצה שלך'
  if (message.includes('not_your_player')) return XI_PROBLEM_HE.unknown
  if (message.includes('bad_players')) return XI_PROBLEM_HE.duplicate
  if (message.includes('bad_slots')) return XI_PROBLEM_HE.incomplete
  if (message.includes('bad_formation')) return 'המערך הזה לא מוכר. בחר מערך מהרשימה'
  if (message.includes('no such match')) return 'המשחק לא נמצא'
  if (message.includes('not signed in') || message.includes('no profile')) return 'צריך להתחבר כדי לשמור הרכב'
  return 'ההרכב לא נשמר. נסה שוב'
}

// ── what the match page passes to the client ──────────────────────────────────────────────
/** `pos`: the squad's position code (CB, LW…), shown on the card's badge. */
export type SquadPlayer = { id: string; number: number | null; name: string; short: string; pos: string; role: Role; injured: boolean }
export type SavedLineup = { formation: Formation; xi: XI }
/** open: before kick-off, building allowed; locked: kicked off, not over; done: finished (ratings shown);
 *  off: postponed, cancelled or abandoned (not "locked by the whistle"). */
export type LineupPhase = 'open' | 'locked' | 'done' | 'off'

/** The database accepts a lineup only before kick-off of a match not yet started (status NS or TBD). */
export function canBuild(f: { t: number; st: string }, nowMs: number): boolean {
  return (f.st === 'NS' || f.st === 'TBD') && f.t * 1000 > nowMs
}

export function lineupPhase(f: { t: number; st: string }, nowMs: number): LineupPhase {
  if (canBuild(f, nowMs)) return 'open'
  if (DONE_STATUSES.has(f.st)) return 'done'
  return NOT_PLAYED_STATUSES.has(f.st) ? 'off' : 'locked'
}
