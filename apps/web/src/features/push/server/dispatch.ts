import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { displayTeam } from '@/features/matches/api-teams'
import type { FixtureDetail } from '@/features/matches/schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { alertText, freshInOrder, goalsSince } from '../alerts'
import { pushConfigured, sendPush } from './send'

/** Alerts claimed per dispatch call. */
const CLAIM_LIMIT = 50
/** Recipients read per page (keyset on user_id; the API returns at most 1000 rows per request). */
const RECIPIENT_PAGE = 1000

/** True only for `Bearer <secret>` with the configured secret. Compared in constant time; no secret → false. */
export function bearerOk(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false
  const given = createHash('sha256').update(header.slice('Bearer '.length)).digest()
  const want = createHash('sha256').update(secret).digest()
  return timingSafeEqual(given, want)
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

async function recipients(admin: Admin, fixtureId: number): Promise<string[]> {
  const out: string[] = []
  let after: string | undefined
  for (;;) {
    const { data, error } = await admin.rpc('alert_recipients', { p_fixture: fixtureId, p_after: after, p_limit: RECIPIENT_PAGE })
    if (error) {
      console.warn('alert recipients failed', error.code)
      break
    }
    if (!data?.length) break
    out.push(...data)
    if (data.length < RECIPIENT_PAGE) break
    after = data[data.length - 1]
  }
  return out
}

/**
 * Claims unsent match alerts and pushes them. Claiming marks them sent first, so a failed or concurrent run never
 * pushes one twice. Alerts older than 30 minutes are skipped (stale); the rest go out oldest first (by id), so the
 * lock screen (one tag per match) ends on the latest score or full time. Fixtures, events, team names and earlier
 * alerts are read once per batch; recipients once per match. Logs counts only.
 */
export async function dispatchAlerts(): Promise<{ sent: number; skipped: number }> {
  const admin = createAdminClient()
  if (!admin) return { sent: 0, skipped: 0 }
  const { data: claimed, error } = await admin.rpc('claim_alerts', { p_limit: CLAIM_LIMIT })
  if (error) console.warn('claim alerts failed', error.code)
  if (error || !claimed?.length) return { sent: 0, skipped: 0 }

  const now = Date.now()
  const fresh = freshInOrder(claimed, now)
  let skipped = claimed.length - fresh.length
  if (!fresh.length || !pushConfigured()) return { sent: 0, skipped: claimed.length }

  const fixtureIds = [...new Set(fresh.map((a) => a.fixture_id))]
  const [fixtures, details, earlier] = await Promise.all([
    admin.from('fixtures').select('id,home_api_id,away_api_id').in('id', fixtureIds),
    admin.from('fixture_details').select('fixture_id,events').in('fixture_id', fixtureIds),
    admin.from('match_alerts').select('id,fixture_id,home_goals,away_goals').in('fixture_id', fixtureIds).eq('kind', 'goal').order('id'),
  ])
  const fixtureById = new Map((fixtures.data ?? []).map((f) => [f.id, f]))
  const eventsById = new Map((details.data ?? []).map((d) => [d.fixture_id, d.events as unknown as FixtureDetail['ev']]))
  const apiIds = [...new Set([...fixtureById.values()].flatMap((f) => [f.home_api_id, f.away_api_id]))]
  const { data: teams } = apiIds.length ? await admin.from('api_teams').select('api_id,name').in('api_id', apiIds) : { data: [] }
  const teamName = (apiId: number) => displayTeam(apiId, teams?.find((t) => t.api_id === apiId)?.name).name

  const fans = new Map<number, string[]>()
  let sent = 0
  for (const alert of fresh) {
    const f = fixtureById.get(alert.fixture_id)
    if (!f) {
      skipped++
      continue
    }
    // The previous goal alert of this match (by id); none → the match started 0:0. Full time lists no scorers.
    const prev = (earlier.data ?? []).filter((e) => e.fixture_id === f.id && e.id < alert.id).at(-1)
    const events = eventsById.get(f.id)
    const { scorers, minute } =
      alert.kind === 'goal'
        ? goalsSince(
            Array.isArray(events) ? events : [],
            { home: f.home_api_id, away: f.away_api_id },
            { h: prev?.home_goals ?? 0, a: prev?.away_goals ?? 0 },
            { h: alert.home_goals, a: alert.away_goals },
          )
        : { scorers: [], minute: null }
    if (!fans.has(f.id)) fans.set(f.id, await recipients(admin, f.id))
    const to = fans.get(f.id)!
    if (to.length) await sendPush(to, alertText(alert, teamName(f.home_api_id), teamName(f.away_api_id), scorers, minute))
    sent++
  }
  console.info(`alerts dispatched: sent=${sent} skipped=${skipped}`)
  return { sent, skipped }
}
