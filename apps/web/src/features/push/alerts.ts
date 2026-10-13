import type { FixtureDetail } from '@/features/matches/schema'
import type { PushPayload } from './schema'

/** A row of match_alerts as the dispatcher sees it (written by the fixtures_alerts trigger). */
export type MatchAlert = {
  id: number
  fixture_id: number
  kind: string // 'goal' | 'ft'
  home_goals: number
  away_goals: number
  scoring_api_id: number | null
}

type Score = { h: number; a: number }
type GoalEvent = FixtureDetail['ev'][number]

/** Alerts older than this when claimed are marked sent without a push (the in-app banner already showed them). */
export const STALE_MS = 30 * 60 * 1000

export function isStale(createdAt: string, now: number): boolean {
  const t = Date.parse(createdAt)
  return !Number.isFinite(t) || now - t > STALE_MS
}

/**
 * The claimed alerts still worth pushing, oldest first. claim_alerts does not guarantee the order of its rows, and
 * alerts of one match share a notification tag, so sending in id order makes the last one shown the newest.
 */
export function freshInOrder<T extends { id: number; created_at: string }>(claimed: readonly T[], now: number): T[] {
  return claimed.filter((a) => !isStale(a.created_at, now)).sort((p, q) => p.id - q.id)
}

/** "45+2" for stoppage time, else "67". */
export function goalMinute(m: number, x: number): string {
  return x > 0 ? `${m}+${x}` : `${m}`
}

/**
 * The goals scored after the previously alerted score, up to the new one. Walks the goal events in time order,
 * keeping a running score per side (the event's `team` is the side credited, own goals included); a goal counts when
 * its side's running count passes the previous score and has not passed the new one. Missed penalties are not goals.
 */
export function goalsSince(
  events: readonly GoalEvent[],
  sides: { home: number; away: number },
  prev: Score,
  now: Score,
): { scorers: string[]; minute: string | null } {
  const goals = events
    .filter((e) => e.type === 'Goal' && e.det !== 'Missed Penalty')
    .map((e, i) => ({ e, i }))
    .sort((p, q) => p.e.m - q.e.m || p.e.x - q.e.x || p.i - q.i)
  const run = { h: 0, a: 0 }
  const scorers: string[] = []
  let minute: string | null = null
  for (const { e } of goals) {
    const side = e.team === sides.home ? 'h' : e.team === sides.away ? 'a' : null
    if (!side) continue
    run[side] += 1
    if (run[side] > prev[side] && run[side] <= now[side]) {
      if (e.p) scorers.push(e.p)
      minute = goalMinute(e.m, e.x)
    }
  }
  return { scorers, minute }
}

/** The phone notification for a goal or full time (Hebrew copy as in the spec). One tag per match. */
export function alertText(alert: MatchAlert, home: string, away: string, scorers: readonly string[], minute: string | null): PushPayload {
  const score = `${home} ${alert.home_goals}:${alert.away_goals} ${away}`
  const url = `/matches/${alert.fixture_id}`
  const tag = `match:${alert.fixture_id}`
  if (alert.kind === 'ft') return { title: `סיום: ${score}`, body: '', url, tag }
  const body = [minute ? `${minute}′` : '', scorers.join(', ')].filter(Boolean).join(' · ')
  return { title: `⚽ שער! ${score}`, body, url, tag }
}
