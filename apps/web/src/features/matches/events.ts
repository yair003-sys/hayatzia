// Match events (goals, cards, substitutions, VAR) as Hebrew timeline rows. Pure: safe on the server and in tests.
import type { FixtureDetail } from './schema'

export type FixtureEvent = FixtureDetail['ev'][number]
export type EventKind = 'goal' | 'own-goal' | 'penalty' | 'missed-penalty' | 'yellow' | 'red' | 'sub' | 'var' | 'other'
/** `player`: the main name on the row; `extra`: a second line (assist, who went off). */
export type EventView = { kind: EventKind; label: string; player: string; extra: string; minute: string; team: number }

/** "45′", or "90+3′" in stoppage time. */
export function minuteText(m: number, x: number): string {
  return x > 0 ? `${m}+${x}′` : `${m}′`
}

const GOAL: Record<string, [EventKind, string]> = {
  'Own Goal': ['own-goal', 'שער עצמי'],
  Penalty: ['penalty', 'שער בפנדל'],
  'Missed Penalty': ['missed-penalty', 'החמצת פנדל'],
}

const PLAIN_GOAL: [EventKind, string] = ['goal', 'שער']

const VAR: Record<string, string> = {
  'Goal cancelled': 'VAR · השער נפסל',
  'Goal confirmed': 'VAR · השער אושר',
  'Penalty confirmed': 'VAR · הפנדל אושר',
  'Penalty cancelled': 'VAR · הפנדל בוטל',
  'Card upgrade': 'VAR · הכרטיס הוחמר',
}

/** One provider event (API-Football via the ingest) → a Hebrew timeline row. */
export function eventView(e: FixtureEvent): EventView {
  const base = { player: e.p, extra: '', minute: minuteText(e.m, e.x), team: e.team }
  switch (e.type) {
    case 'Goal': {
      const [kind, label] = GOAL[e.det] ?? PLAIN_GOAL
      return { ...base, kind, label, extra: kind === 'goal' && e.as ? `בישול: ${e.as}` : '' }
    }
    case 'Card':
      return e.det === 'Yellow Card' ? { ...base, kind: 'yellow', label: 'כרטיס צהוב' } : { ...base, kind: 'red', label: 'כרטיס אדום' }
    case 'subst':
      // The provider puts the player going off in `player` and the one coming on in `assist` (checked against line-ups in data/fx).
      return e.as ? { ...base, kind: 'sub', label: 'חילוף', player: e.as, extra: `במקום ${e.p}` } : { ...base, kind: 'sub', label: 'חילוף' }
    case 'Var':
      return { ...base, kind: 'var', label: VAR[e.det] ?? 'VAR' }
    default:
      return { ...base, kind: 'other', label: 'אירוע' }
  }
}

/** What happened to one player, for a badge on the pitch: goals scored, booked, sent off, taken off. */
export type PlayerMark = { goals: number; yellow: boolean; red: boolean; off: boolean }

/**
 * Per-player marks for one team, keyed by the provider's player name (same string the line-up uses, so it matches a
 * pitch spot by `name`). Own goals and missed penalties are not credited as goals; a non-yellow card reads as a red,
 * matching the timeline. A substitution marks the player going off (`e.p`).
 */
export function playerMarks(ev: FixtureEvent[], teamApiId: number): Map<string, PlayerMark> {
  const marks = new Map<string, PlayerMark>()
  const of = (name: string): PlayerMark => {
    let m = marks.get(name)
    if (!m) {
      m = { goals: 0, yellow: false, red: false, off: false }
      marks.set(name, m)
    }
    return m
  }
  for (const e of ev) {
    if (e.team !== teamApiId || !e.p) continue
    if (e.type === 'Goal') {
      if (e.det !== 'Missed Penalty' && e.det !== 'Own Goal') of(e.p).goals += 1
    } else if (e.type === 'Card') {
      if (e.det === 'Yellow Card') of(e.p).yellow = true
      else of(e.p).red = true
    } else if (e.type === 'subst') {
      of(e.p).off = true
    }
  }
  return marks
}

/** Timeline rows, newest first (stoppage time after its regular minute; same-minute events in reverse provider order). */
export function timeline(ev: FixtureEvent[]): (EventView & { key: string })[] {
  return ev
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.m - a.e.m || b.e.x - a.e.x || b.i - a.i)
    .map(({ e, i }) => ({ ...eventView(e), key: `${i}` }))
}
