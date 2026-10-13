import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BannerAlert } from '../banner'
import { describeAlerts } from './describe'

/**
 * One goal / full-time alert as the in-app banner shows it: the phone notification's text plus the two clubs and the
 * scoring club's colour. Every signed-in fan asks for the same alert at the same moment, so it is cached (here and on
 * the CDN by the route) and the database is read about once per alert, not once per fan. Throws on a read error.
 */
export async function getBannerAlert(id: number): Promise<BannerAlert | null> {
  'use cache'
  cacheLife({ stale: 30, revalidate: 30, expire: 600 })
  cacheTag(`alert-${id}`)
  const admin = createAdminClient()
  if (!admin) return null
  const { data: alert, error } = await admin
    .from('match_alerts')
    .select('id,fixture_id,kind,home_goals,away_goals,scoring_api_id')
    .eq('id', id)
    .maybeSingle()
  // Read errors throw, so a failure is never cached as "no such alert" or as a text without its scorer.
  if (error) throw new Error('banner alert: read failed')
  if (!alert) return null
  const d = (await describeAlerts(admin, [alert], { strict: true })).get(alert.id)
  if (!d) return null
  return { title: d.push.title, body: d.push.body, homeApiId: d.homeApiId, awayApiId: d.awayApiId, bar: d.bar }
}
