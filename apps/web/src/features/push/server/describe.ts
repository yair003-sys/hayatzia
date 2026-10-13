import 'server-only'
import { displayTeam } from '@/features/matches/api-teams'
import type { FixtureDetail } from '@/features/matches/schema'
import type { createAdminClient } from '@/lib/supabase/admin'
import { alertText, goalsSince, type MatchAlert } from '../alerts'
import type { PushPayload } from '../schema'

export type Admin = NonNullable<ReturnType<typeof createAdminClient>>

export type DescribedAlert = {
  push: PushPayload
  homeApiId: number
  awayApiId: number
  /** The scoring club's bar colour; null for full time or when both sides scored between two updates. */
  bar: string | null
}

/**
 * The phone notification text of each alert, built once for both the push (dispatch) and the in-app banner
 * (/api/alerts/<id>), so the two always read the same. Fixtures, goal events, team names and earlier goal alerts are
 * read once per batch (four queries, whatever the batch size). Alerts of an unknown fixture are left out.
 * A read error: `strict` throws (the cached banner must not keep a partial text); otherwise the text is built from what
 * was read (dispatch has already claimed the alerts, so a push without the scorer beats no push).
 */
export async function describeAlerts(
  admin: Admin,
  alerts: readonly MatchAlert[],
  { strict = false }: { strict?: boolean } = {},
): Promise<Map<number, DescribedAlert>> {
  const out = new Map<number, DescribedAlert>()
  if (!alerts.length) return out
  const fixtureIds = [...new Set(alerts.map((a) => a.fixture_id))]
  const [fixtures, details, earlier] = await Promise.all([
    admin.from('fixtures').select('id,home_api_id,away_api_id').in('id', fixtureIds),
    admin.from('fixture_details').select('fixture_id,events').in('fixture_id', fixtureIds),
    admin.from('match_alerts').select('id,fixture_id,home_goals,away_goals').in('fixture_id', fixtureIds).eq('kind', 'goal').order('id'),
  ])
  if (strict && (fixtures.error || details.error || earlier.error)) throw new Error('alert describe: read failed')
  const fixtureById = new Map((fixtures.data ?? []).map((f) => [f.id, f]))
  const eventsById = new Map((details.data ?? []).map((d) => [d.fixture_id, d.events as unknown as FixtureDetail['ev']]))
  const apiIds = [...new Set([...fixtureById.values()].flatMap((f) => [f.home_api_id, f.away_api_id]))]
  const { data: teams, error: teamsError } = apiIds.length
    ? await admin.from('api_teams').select('api_id,name').in('api_id', apiIds)
    : { data: [], error: null }
  if (strict && teamsError) throw new Error('alert describe: read failed')
  const team = (apiId: number) => displayTeam(apiId, teams?.find((t) => t.api_id === apiId)?.name)

  for (const alert of alerts) {
    const f = fixtureById.get(alert.fixture_id)
    if (!f) continue
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
    const scorer = alert.kind === 'goal' && alert.scoring_api_id ? team(alert.scoring_api_id) : null
    out.set(alert.id, {
      push: alertText(alert, team(f.home_api_id).name, team(f.away_api_id).name, scorers, minute),
      homeApiId: f.home_api_id,
      awayApiId: f.away_api_id,
      bar: scorer?.bar ?? null,
    })
  }
  return out
}
