// Staging-only demo of the crowd verdict (דעת הקהל): a labelled demo match, labelled demo fans,
// a chat burst that opens a poll by itself, scripted match events, and demo votes trickling in.
// Run: DEMO_TARGET=staging SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/demo-match.ts
// Refuses to run against production. Re-running replaces the previous demo match (cascade).
import type { FixtureDetail } from '../src/features/matches/schema.ts'
import { buildCardPoll, buildGoalPoll, buildSub60Polls, buildSubEventPoll, type EventPoll, type SquadPlayer } from '../src/features/crowd-verdict/players.ts'
import { notice, supabaseFromEnv } from './lib/rest.ts'

const PRODUCTION_REF = 'loaqhisfhafjbrmtygrp'
const PRODUCTION_APP = 'hayatzia-flame.vercel.app'
if (
  process.env.DEMO_TARGET !== 'staging' ||
  (process.env.SUPABASE_URL ?? '').includes(PRODUCTION_REF) ||
  (process.env.APP_URL ?? '').includes(PRODUCTION_APP)
) {
  console.error('demo-match runs on staging only')
  process.exit(1)
}

// Runs without ci-step.sh so notices stream live; failures still surface as annotations.
for (const ev of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(ev, (e) => {
    console.log(`::error title=demo match::${String(e).slice(0, 500).replace(/\n/g, '%0A')}`)
    process.exit(1)
  })
}

const { rest, auth, rpc } = supabaseFromEnv()
const FIXTURE = 900000001
const HOME = { apiId: 604, clubId: 'mta' }
const AWAY = { apiId: 563, clubId: 'hbs' }
const MINUTES_IN = 55
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!
/** Asks the app to send goal / full-time alerts now. Optional (needs APP_URL + ALERTS_SECRET); logs status and counts only, never throws. */
async function dispatchAlerts() {
  const base = process.env.APP_URL
  const secret = process.env.ALERTS_SECRET
  if (!base || !secret) return
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/api/alerts/dispatch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        // Vercel Deployment Protection on previews: the "Protection Bypass for Automation" secret, when set.
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
      },
      signal: AbortSignal.timeout(75_000), // the route may run up to 60 s (maxDuration)
    })
    const body = (await r.json().catch(() => ({}))) as { sent?: number; skipped?: number; more?: boolean }
    notice('demo alerts', `dispatch HTTP ${r.status} sent=${body.sent ?? '?'} skipped=${body.skipped ?? '?'} more=${body.more ?? '?'}`)
  } catch {
    notice('demo alerts', 'dispatch failed (ignored)')
  }
}
const json = async <T>(r: Response): Promise<T> => (await r.json()) as T

// ── demo fans ──────────────────────────────────────────────────────────────────────────────
type Fan = { id: string; club: string; group: 'h' | 'a' | 'n' }
const NAMES = ['יוסי', 'אבי', 'שירן', 'דודו', 'נועם', 'רוני', 'גלעד', 'מאיה', 'עומר', 'טל', 'ליאור', 'שני', 'איתי', 'נוי', 'אלון']
const PLAN: { club: string; group: Fan['group']; count: number }[] = [
  { club: 'mta', group: 'h', count: 12 },
  { club: 'hbs', group: 'a', count: 12 },
  { club: 'mhf', group: 'n', count: 3 },
  { club: 'bei', group: 'n', count: 3 },
]

async function demoFans(): Promise<Fan[]> {
  const list = await json<{ users: { id: string; email?: string }[] }>(await auth('GET', 'admin/users?per_page=1000'))
  const byEmail = new Map(list.users.map((u) => [u.email ?? '', u.id]))
  const fans: Fan[] = []
  let i = 0
  for (const p of PLAN) {
    for (let k = 0; k < p.count; k++, i++) {
      const email = `demo-fan-${String(i + 1).padStart(2, '0')}@demo.hayatzia.test`
      let id = byEmail.get(email)
      if (!id) {
        const u = await json<{ id: string }>(
          await auth('POST', 'admin/users', { email, email_confirm: true, user_metadata: { demo: true } }),
        )
        id = u.id
      }
      fans.push({ id, club: p.club, group: p.group })
      await rest(
        'POST',
        'profiles?on_conflict=user_id',
        { user_id: id, nick: `דמו·${NAMES[i % NAMES.length]}${i + 1}`, team_id: p.club },
        'resolution=ignore-duplicates,return=minimal',
      )
    }
  }
  return fans
}

// ── demo match ─────────────────────────────────────────────────────────────────────────────
type PlayerRow = { team_id: string; number: number | null; name_he: string; name_short: string; position: string; in_xi: boolean }

async function squads(): Promise<Record<string, PlayerRow[]>> {
  const rows = await json<PlayerRow[]>(
    await rest('GET', `players?team_id=in.(${HOME.clubId},${AWAY.clubId})&number=not.is.null&select=team_id,number,name_he,name_short,position,in_xi&order=number`),
  )
  return { [HOME.clubId]: rows.filter((r) => r.team_id === HOME.clubId), [AWAY.clubId]: rows.filter((r) => r.team_id === AWAY.clubId) }
}

function lineup(apiId: number, players: PlayerRow[]): FixtureDetail['lu'][number] {
  const xi = [...players.filter((p) => p.in_xi), ...players.filter((p) => !p.in_xi)].slice(0, 11)
  const sub = players.filter((p) => !xi.includes(p)).slice(0, 7)
  const row = (p: PlayerRow) => ({ n: p.number, p: p.name_he, pos: p.position })
  return { team: apiId, f: '4-3-3', coach: '', xi: xi.map((p) => ({ ...row(p), g: null })), sub: sub.map(row) }
}

async function createMatch(sq: Record<string, PlayerRow[]>): Promise<FixtureDetail> {
  const latest = await json<{ season: number }[]>(await rest('GET', 'fixtures?select=season&order=season.desc&limit=1'))
  await rest('DELETE', `fixtures?id=eq.${FIXTURE}`)
  await rest('POST', 'fixtures', {
    id: FIXTURE,
    league_id: 383,
    season: latest[0]?.season ?? 2024,
    round: 'Regular Season - 1',
    kickoff_at: new Date(Date.now() - MINUTES_IN * 60_000).toISOString(),
    status: '2H',
    elapsed: MINUTES_IN,
    home_api_id: HOME.apiId,
    away_api_id: AWAY.apiId,
    home_goals: 1,
    away_goals: 1,
    venue: 'משחק לדוגמה',
    is_demo: true,
  }, 'return=minimal')
  const detail: FixtureDetail = { ev: [], lu: [lineup(HOME.apiId, sq[HOME.clubId]!), lineup(AWAY.apiId, sq[AWAY.clubId]!)] }
  await rest('POST', 'fixture_details', { fixture_id: FIXTURE, events: detail.ev, lineups: detail.lu }, 'return=minimal')
  return detail
}

async function saveEvents(detail: FixtureDetail) {
  await rest('PATCH', `fixture_details?fixture_id=eq.${FIXTURE}`, { events: detail.ev, updated_at: new Date().toISOString() }, 'return=minimal')
}

// ── chat ───────────────────────────────────────────────────────────────────────────────────
const CHATTER = ['יאללה!', 'איזה משחק', 'קדימה', 'השופט ישן', 'חייבים גול', 'איזו מסירה', 'לחץ לחץ!', 'המגרש בוער 🔥', 'מה הוא עושה?', 'חלש']
const PENALTY_LINES = ['פנדל!!', 'פנדללללל', 'פנדל ברור', 'זה פנדל', 'פנדל!!!', 'איזה פנדל?? צלילה', 'penalty']
let messages = 0
let sayErrors = 0

async function say(fan: Fan, body: string) {
  try {
    // team_id is sent so the column default (my_team(), for signed-in fans) is not evaluated; the trigger re-stamps it.
    await rest('POST', 'match_messages', { fixture_id: FIXTURE, user_id: fan.id, team_id: fan.club, body }, 'return=minimal')
    messages++
  } catch (e) {
    // rate limit: skip this line; anything else is reported once
    if (!String(e).includes('rate_limit') && sayErrors++ === 0) notice('demo chat error', String(e).slice(0, 300))
  }
}

// ── votes ──────────────────────────────────────────────────────────────────────────────────
type OpenPoll = { id: string; kind: string; voter_scope: string | null; options: { id: string }[]; options_in: { id: string }[] | null }
const voted = new Map<string, Set<string>>()
let votes = 0
let voteErrors = 0
const polls = new Set<string>()

/** Home fans lean to the first option, away fans to the second, neutral fans spread. */
function choose(p: OpenPoll, fan: Fan): string {
  const ids = p.options.map((o) => o.id)
  const lean = fan.group === 'h' ? 0 : fan.group === 'a' ? 1 : -1
  if (lean >= 0 && ids[lean] && Math.random() < 0.7) return ids[lean]!
  return pick(ids)
}

async function castSomeVotes(fans: Fan[]) {
  const open = await json<OpenPoll[]>(
    await rest('GET', `match_polls?fixture_id=eq.${FIXTURE}&summary=is.null&closes_at=gt.${new Date().toISOString()}&select=id,kind,voter_scope,options,options_in`),
  )
  for (const p of open) {
    polls.add(p.id)
    const done = voted.get(p.id) ?? new Set<string>()
    voted.set(p.id, done)
    const eligible = fans.filter((f) => !done.has(f.id) && (p.voter_scope === null || p.voter_scope === f.club))
    for (const fan of eligible.sort(() => Math.random() - 0.5).slice(0, 3)) {
      done.add(fan.id)
      const body: Record<string, string> = { poll_id: p.id, user_id: fan.id, option_id: choose(p, fan) }
      if (p.kind === 'sub60' && p.options_in?.length) {
        body.option_id = pick(p.options.slice(0, 4)).id
        body.option_in = pick(p.options_in.slice(0, 3)).id
      }
      try {
        await rest('POST', 'match_poll_votes', body, 'return=minimal')
        votes++
      } catch (e) {
        if (!String(e).includes('poll_closed') && voteErrors++ === 0) notice('demo vote error', String(e).slice(0, 300))
      }
    }
  }
}

async function openEvent(poll: EventPoll) {
  await rpc('open_event_poll', {
    p_fixture: FIXTURE,
    p_kind: poll.kind,
    p_question: poll.question,
    p_options: poll.options,
    p_options_in: poll.optionsIn,
    p_scope: poll.scope,
  })
}

// ── timeline ───────────────────────────────────────────────────────────────────────────────
const fans = await demoFans()
const sq = await squads()
const detail = await createMatch(sq)
const squadOf = (club: string): SquadPlayer[] => sq[club]!.map((p) => ({ number: p.number, name_short: p.name_short }))
const players = (club: string) => (club === HOME.clubId ? detail.lu[0]! : detail.lu[1]!)
notice('demo match', `demo match ready: /matches/${FIXTURE} (${fans.length} demo fans). It may take up to a minute to appear.`)

const writers = fans.filter((f) => f.group !== 'n')
const start = Date.now()
const at = (s: number) => Date.now() - start >= s * 1000
const fired = new Set<string>()
const once = (key: string, s: number) => {
  if (!at(s) || fired.has(key)) return false
  fired.add(key)
  return true
}

while (!at(600)) {
  if (!at(90) || at(130)) await say(pick(writers), pick(CHATTER))
  if (at(90) && !at(130)) {
    // the burst: many different fans write "פנדל" within a minute → the database opens the poll itself
    for (const fan of writers.sort(() => Math.random() - 0.5).slice(0, 3)) await say(fan, pick(PENALTY_LINES))
  }
  if (once('card', 200)) {
    const away = players(AWAY.clubId)
    const p = away.xi[4]!
    const ev = { m: 63, x: 0, team: AWAY.apiId, p: p.p, as: '', type: 'Card', det: 'Yellow Card' }
    detail.ev.push(ev)
    await saveEvents(detail)
    await openEvent(buildCardPoll(ev, p, squadOf(AWAY.clubId)))
  }
  if (once('sub60', 300)) {
    for (const poll of buildSub60Polls(detail, HOME, AWAY, 60, { [HOME.clubId]: squadOf(HOME.clubId), [AWAY.clubId]: squadOf(AWAY.clubId) })) {
      await openEvent(poll)
    }
  }
  if (once('goal', 400)) {
    const home = players(HOME.clubId)
    const p = home.xi[9]!
    const ev = { m: 71, x: 0, team: HOME.apiId, p: p.p, as: '', type: 'Goal', det: 'Normal Goal' }
    detail.ev.push(ev)
    await saveEvents(detail)
    await rest('PATCH', `fixtures?id=eq.${FIXTURE}`, { home_goals: 2, elapsed: 71 }, 'return=minimal')
    await dispatchAlerts()
    await openEvent(buildGoalPoll(ev, p, squadOf(HOME.clubId)))
  }
  if (once('sub', 500)) {
    const home = players(HOME.clubId)
    const off = home.xi[8]!
    const on = home.sub[0]!
    const ev = { m: 78, x: 0, team: HOME.apiId, p: off.p, as: on.p, type: 'subst', det: 'Substitution 1' }
    detail.ev.push(ev)
    await saveEvents(detail)
    await openEvent(buildSubEventPoll(ev, off, on, squadOf(HOME.clubId)))
  }
  await castSomeVotes(fans)
  await rpc('crowd_tick', { p_fixture: FIXTURE })
  await sleep(2500)
}
await sleep(95_000) // let the last poll run out
await rpc('crowd_tick', { p_fixture: FIXTURE })

// Full time: the room stays open ~100 more minutes, so fans can rate the players 1–10 (player of the match).
await rest('PATCH', `fixtures?id=eq.${FIXTURE}`, { status: 'FT', elapsed: 90 }, 'return=minimal')
await dispatchAlerts()
let ratings = 0
for (const fan of fans.filter((f) => f.group !== 'n')) {
  const squad = sq[fan.club]!.filter((p) => p.in_xi).slice(0, 11)
  for (const p of squad.sort(() => Math.random() - 0.5).slice(0, 5)) {
    const id = `${fan.club}_${p.number}`
    try {
      await rest('POST', 'match_ratings', { user_id: fan.id, fixture_id: FIXTURE, player_id: id, score: 4 + Math.floor(Math.random() * 7) }, 'return=minimal')
      ratings++
    } catch {
      // player id not in this squad format: skip
    }
  }
}
notice('demo match', `full time: ${ratings} demo ratings for player of the match`)

notice('demo match', `done: ${fans.length} demo fans, ${messages} messages, ${polls.size} polls, ${votes} demo votes`)
if (polls.size < 4) {
  console.error(`expected at least 4 polls, saw ${polls.size}`)
  process.exit(1)
}
