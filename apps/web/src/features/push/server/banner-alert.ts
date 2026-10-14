import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BannerAlert } from '../banner'
import { describeAlerts } from './describe'

/**
 * Thrown (never returned) for an unknown alert: inside 'use cache' a throw is not cached, a null would be. In a
 * production build the error that leaves the cache arrives with its message hidden, so callers that must tell a miss
 * from a failure also ask alertExists (below) when the message is not there.
 */
export const ALERT_NOT_FOUND = 'alert_not_found'

/**
 * One goal / full-time alert as the in-app banner shows it: the phone notification's text plus the two clubs and the
 * scoring club's colour. Every signed-in fan asks for the same alert at the same moment, so it is cached (here and on
 * the CDN by the route) and the database is read about once per alert, not once per fan. Only a complete answer is
 * cached: an unknown alert throws ALERT_NOT_FOUND and a read error throws too, so neither can hide the real banner
 * (e.g. a request for the next id before that alert exists).
 */
export async function getBannerAlert(id: number): Promise<BannerAlert> {
  'use cache'
  cacheLife({ stale: 30, revalidate: 30, expire: 600 })
  cacheTag(`alert-${id}`)
  const admin = createAdminClient()
  if (!admin) throw new Error('banner alert: not configured')
  const { data: alert, error } = await admin
    .from('match_alerts')
    .select('id,fixture_id,kind,home_goals,away_goals,scoring_api_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`banner alert: read failed (${error.code ?? 'unknown'})`)
  if (!alert) throw new Error(ALERT_NOT_FOUND)
  const d = (await describeAlerts(admin, [alert], { strict: true })).get(alert.id)
  if (!d) throw new Error(ALERT_NOT_FOUND)
  return { title: d.push.title, body: d.push.body, homeApiId: d.homeApiId, awayApiId: d.awayApiId, bar: d.bar }
}

/**
 * Uncached: does this alert exist? Only for the error path of the banner route (misses and failures are rare, and a
 * lookup by primary key is cheap). null when it cannot tell (no server key, or a read error).
 */
export async function alertExists(id: number): Promise<boolean | null> {
  const admin = createAdminClient()
  if (!admin) return null
  const { data, error } = await admin.from('match_alerts').select('id').eq('id', id).maybeSingle()
  if (error) {
    // Error code and a short reason only (no data): enough to tell a bad key from a missing table.
    console.warn(`alert exists: read failed ${error.code ?? ''} ${(error.message ?? '').slice(0, 80)}`)
    return null
  }
  return data !== null
}
