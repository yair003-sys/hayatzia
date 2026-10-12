// Builds event and scheduled polls from a match's lineups and events (pure).
// No runtime imports: scripts/demo-match.ts runs this file directly with Node's type stripping,
// and the live-events poller will use it the same way later.
import type { FixtureDetail } from '../matches/schema.ts'
import type { PollKind, PollOption } from './schema.ts'

export type SquadPlayer = { number: number | null; name_short: string }
export type LineupPlayer = { n: number | null; p: string }
export type MatchEvent = FixtureDetail['ev'][number]
export type Club = { apiId: number; clubId: string }
export type EventPoll = {
  kind: PollKind
  question: string
  options: PollOption[]
  optionsIn: PollOption[] | null
  scope: string | null
}

export function playerKey(teamApiId: number, p: LineupPlayer): string {
  return `${teamApiId}:${p.n ?? p.p}`
}

/** Our Hebrew short name when the shirt number is in our squad, otherwise the provider's name. */
export function hebrewName(p: LineupPlayer, squad: SquadPlayer[]): string {
  return (p.n !== null && squad.find((s) => s.number === p.n)?.name_short) || p.p
}

const lastName = (name: string) => name.trim().split(/\s+/).pop()?.toLowerCase() ?? ''

/** Provider names differ between events and lineups ("M. Levi" / "Maor Levi"): exact, then by last name. */
function findByName<T extends LineupPlayer>(list: T[], name: string): T | undefined {
  return list.find((p) => p.p === name) ?? list.find((p) => lastName(p.p) === lastName(name))
}

function option(teamApiId: number, p: LineupPlayer, squad: SquadPlayer[]): PollOption {
  return { id: playerKey(teamApiId, p), emoji: p.n === null ? '👤' : String(p.n), label: hebrewName(p, squad) }
}

/** Players on the pitch ("out" row) and unused substitutes ("bench") at a minute. Players taken off are in neither. */
export function onPitch(
  detail: FixtureDetail,
  teamApiId: number,
  minute: number,
  squad: SquadPlayer[] = [],
): { out: PollOption[]; bench: PollOption[] } {
  const lu = detail.lu.find((l) => l.team === teamApiId)
  if (!lu) return { out: [], bench: [] }
  const playing: LineupPlayer[] = [...lu.xi]
  const bench: LineupPlayer[] = [...lu.sub]
  for (const e of detail.ev) {
    if (e.type !== 'subst' || e.team !== teamApiId || e.m > minute) continue
    const off = findByName(playing, e.p) // provider: p = player taken off, as = player brought on
    const on = findByName(bench, e.as)
    if (off) playing.splice(playing.indexOf(off), 1)
    if (on) {
      bench.splice(bench.indexOf(on), 1)
      playing.push(on)
    }
  }
  return {
    out: playing.map((p) => option(teamApiId, p, squad)),
    bench: bench.map((p) => option(teamApiId, p, squad)),
  }
}

const name = (player: LineupPlayer | null, fallback: string, squad: SquadPlayer[]) =>
  player ? hebrewName(player, squad) : fallback

export function buildCardPoll(ev: MatchEvent, player: LineupPlayer | null, squad: SquadPlayer[]): EventPoll {
  const who = name(player, ev.p, squad)
  const yellow = !/red/i.test(ev.det)
  return {
    kind: 'card',
    question: yellow ? `הצהוב ל${who} מוצדק?` : `האדום ל${who} מוצדק?`,
    options: [
      { id: 'ok', emoji: '✅', label: 'מוצדק' },
      { id: 'no', emoji: '❌', label: 'לא' },
      ...(yellow ? [{ id: 'red', emoji: '🟥', label: 'היה אדום' }] : []),
    ],
    optionsIn: null,
    scope: null,
  }
}

export function buildGoalPoll(ev: MatchEvent, player: LineupPlayer | null, squad: SquadPlayer[]): EventPoll {
  return {
    kind: 'goal',
    question: `הגול של ${name(player, ev.p, squad)} חוקי?`,
    options: [
      { id: 'ok', emoji: '✅', label: 'חוקי' },
      { id: 'no', emoji: '❌', label: 'לא' },
    ],
    optionsIn: null,
    scope: null,
  }
}

export function buildSubEventPoll(ev: MatchEvent, off: LineupPlayer | null, on: LineupPlayer | null, squad: SquadPlayer[]): EventPoll {
  return {
    kind: 'sub_event',
    question: `${name(on, ev.as, squad)} במקום ${name(off, ev.p, squad)}: החילוף נכון?`,
    options: [
      { id: 'ok', emoji: '✅', label: 'נכון' },
      { id: 'no', emoji: '❌', label: 'לא' },
    ],
    optionsIn: null,
    scope: null,
  }
}

/** Minute 60: one card per club, voted only by that club's fans: who goes off, who comes on. */
export function buildSub60Polls(
  detail: FixtureDetail,
  home: Club,
  away: Club,
  minute: number,
  squads: Record<string, SquadPlayer[]>,
): EventPoll[] {
  return [home, away].map((c) => {
    const { out, bench } = onPitch(detail, c.apiId, minute, squads[c.clubId] ?? [])
    return { kind: 'sub60', question: 'חילוף: מי יוצא ומי נכנס?', options: out, optionsIn: bench, scope: c.clubId }
  })
}

/** Full time: player of the match, from everyone who played for either club. */
export function buildMotmPoll(
  detail: FixtureDetail,
  home: Club,
  away: Club,
  minute: number,
  squads: Record<string, SquadPlayer[]>,
): EventPoll {
  const options = [home, away].flatMap((c) => onPitch(detail, c.apiId, minute, squads[c.clubId] ?? []).out)
  return { kind: 'motm', question: 'מצטיין המשחק', options, optionsIn: null, scope: null }
}
