import { env } from '@/lib/env'
import { bearerOk, dispatchAlerts } from '@/features/push/server/dispatch'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_STATUSES } from '@/features/matches/schema'
import { type ApiEvent, type ApiFixture, currentSeason, mapLive } from '@/features/matches/ingest/live'
import type { Json, TablesInsert } from '@/lib/supabase/database.types'

// Vercel Cron issues a GET every minute; the tick must run per-request (never cached) and may take up to a minute.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BASE = 'https://v3.football.api-sports.io'
const MIN = 60_000
// Same "in a match window" rule as scripts/update.mjs: live, or kickoff within [-150min, +30min] of now.
const WINDOW_BEFORE_MS = 150 * MIN
const WINDOW_AFTER_MS = 30 * MIN

/** One API-Football GET. Returns the response array, or null on any error. Logs the status code only (public logs). */
async function apiGet<T>(path: string, key: string): Promise<{ data: T[] | null; status: number }> {
  try {
    const r = await fetch(BASE + path, { headers: { 'x-apisports-key': key }, cache: 'no-store' })
    if (!r.ok) {
      console.warn(`live tick: api http ${r.status}`)
      return { data: null, status: r.status }
    }
    const j: unknown = await r.json()
    const body = (j ?? {}) as { response?: unknown; errors?: unknown }
    const errs = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors as object))
    if (errs && errs.length) {
      console.warn(`live tick: api error payload (${r.status})`)
      return { data: null, status: r.status }
    }
    return { data: (Array.isArray(body.response) ? body.response : []) as T[], status: r.status }
  } catch {
    console.warn('live tick: api fetch failed')
    return { data: null, status: 0 }
  }
}

async function handle(request: Request): Promise<Response> {
  // Vercel Cron auto-sends `Authorization: Bearer $CRON_SECRET`; the ingest/demo tooling can also drive it with
  // ALERTS_SECRET. Either admits the request; with neither configured, nothing admits it. Constant-time compare.
  const header = request.headers.get('authorization')
  const ok = bearerOk(header, env.CRON_SECRET?.replace(/\s+/g, '')) || bearerOk(header, env.ALERTS_SECRET?.replace(/\s+/g, ''))
  if (!ok) return Response.json({ error: 'unauthorized' }, { status: 401 })

  // Safe dormant state: no key → do nothing. The branch is safe to deploy before the owner adds the key.
  const key = env.API_FOOTBALL_KEY
  if (!key) return Response.json({ skipped: 'no key' })

  const admin = createAdminClient()
  if (!admin) return Response.json({ skipped: 'no db' })

  const LEAGUE = env.LEAGUE ?? 383
  const SEASON = env.SEASON ?? currentSeason()

  // Decide live cheaply from the DB the 10-minute pipeline already fills — no API call unless a match is in window.
  const { data: known, error: readError } = await admin
    .from('fixtures')
    .select('id,status,kickoff_at')
    .eq('league_id', LEAGUE)
    .eq('season', SEASON)
  if (readError) {
    console.warn(`live tick: fixtures read failed ${readError.code}`)
    return Response.json({ error: 'db', code: readError.code })
  }
  const now = Date.now()
  const inWindow = (known ?? []).some((f) => {
    if (LIVE_STATUSES.has(f.status)) return true
    const k = Date.parse(f.kickoff_at)
    return Number.isFinite(k) && k > now - WINDOW_BEFORE_MS && k < now + WINDOW_AFTER_MS
  })
  if (!inWindow) return Response.json({ skipped: 'no live match' })

  // In window: one fixtures call, then one events call per live fixture of this league.
  const liveRes = await apiGet<ApiFixture>(`/fixtures?league=${LEAGUE}&season=${SEASON}&live=all`, key)
  if (!liveRes.data) return Response.json({ error: 'api', status: liveRes.status })
  const live = liveRes.data.filter((x) => x.league.id === LEAGUE)

  const eventsByFixture = new Map<number, ApiEvent[]>()
  const fetchedEvents = new Set<number>()
  for (const x of live) {
    const evRes = await apiGet<ApiEvent>(`/fixtures/events?fixture=${x.fixture.id}`, key)
    if (evRes.data) {
      eventsByFixture.set(x.fixture.id, evRes.data)
      fetchedEvents.add(x.fixture.id)
    }
  }

  const { apiTeams, fixtures, detailRows } = mapLive(live, eventsByFixture, LEAGUE, SEASON)
  const stamp = new Date().toISOString()
  let wrote = 0
  const fail = (label: string, code: string | undefined) => {
    console.warn(`live tick: ${label} failed ${code ?? ''}`)
  }

  if (fixtures.length) {
    // Same order as scripts/ingest-league.ts so the fixtures trigger fires with the scorers already present:
    // (1) teams, (2) new fixtures (insert only, no trigger), (3) events, (4) fixtures merge (fires fixtures_alerts).
    const teamRows: TablesInsert<'api_teams'>[] = apiTeams.map((t) => ({ ...t, updated_at: stamp }))
    const r1 = await admin.from('api_teams').upsert(teamRows, { onConflict: 'api_id' })
    if (r1.error) fail('api_teams', r1.error.code)

    const fixtureRows: TablesInsert<'fixtures'>[] = fixtures.map((f) => ({ ...f, updated_at: stamp }))
    const r2 = await admin.from('fixtures').upsert(fixtureRows, { onConflict: 'id', ignoreDuplicates: true })
    if (r2.error) fail('fixtures insert', r2.error.code)

    // Events only — never lineups — so the live path never clobbers the lineups the 10-minute pipeline writes.
    // Skip any fixture whose events call failed (no [] overwrite of existing events).
    const eventRows: TablesInsert<'fixture_details'>[] = detailRows
      .filter((d) => fetchedEvents.has(d.fixture_id))
      .map((d) => ({ fixture_id: d.fixture_id, events: d.events as unknown as Json, updated_at: stamp }))
    if (eventRows.length) {
      const r3 = await admin.from('fixture_details').upsert(eventRows, { onConflict: 'fixture_id' })
      if (r3.error) fail('fixture_details', r3.error.code)
    }

    const r4 = await admin.from('fixtures').upsert(fixtureRows, { onConflict: 'id' })
    if (r4.error) fail('fixtures merge', r4.error.code)
    else wrote = fixtureRows.length
  }

  // Push the goal / full-time alerts the trigger just queued, inline, so they reach phones within the minute.
  const dispatched = await dispatchAlerts()

  return Response.json({ live: live.length, events: fetchedEvents.size, teams: apiTeams.length, fixtures: wrote, dispatched })
}

export const POST = handle
export const GET = handle
