import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { freshInOrder } from '../alerts'
import { describeAlerts, type Admin } from './describe'
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
 * lock screen (one tag per match) ends on the latest score or full time. The text comes from describeAlerts (shared
 * with the in-app banner; one read per batch); recipients are read once per match. Logs counts only.
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

  const described = await describeAlerts(admin, fresh)
  const fans = new Map<number, string[]>()
  let sent = 0
  for (const alert of fresh) {
    const d = described.get(alert.id)
    if (!d) {
      skipped++
      continue
    }
    if (!fans.has(alert.fixture_id)) fans.set(alert.fixture_id, await recipients(admin, alert.fixture_id))
    const to = fans.get(alert.fixture_id)!
    if (to.length) await sendPush(to, d.push)
    sent++
  }
  console.info(`alerts dispatched: sent=${sent} skipped=${skipped}`)
  return { sent, skipped }
}
