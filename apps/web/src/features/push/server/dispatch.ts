import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { freshInOrder, groupByMatch } from '../alerts'
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

/** The dispatch route's time limit (its `maxDuration`). 60 s is valid on Vercel Hobby and Pro with Fluid compute. */
export const DISPATCH_MAX_SECONDS = 60
/** Alerts claimed per round: small, so what is claimed is sent before the time runs out and the rest stays queued. */
const CLAIM_BATCH = 5
/** Stop claiming this long before the limit (a round of sends must still fit). */
const SAFETY_MS = 20_000

/**
 * Claims unsent match alerts in small rounds while time remains, and pushes them. Claiming marks them sent first, so
 * a failed or concurrent run never pushes one twice; alerts not yet claimed when time runs out stay for the next call
 * (`more: true`). The database marks alerts older than 30 minutes as sent without claiming them (stale). Within a
 * round, different matches go out in parallel and each match in id order, so its lock-screen notification (one tag per
 * match) ends on the latest score or full time. The text comes from describeAlerts (shared with the in-app banner);
 * recipients are read once per match per call. Logs counts only.
 */
export async function dispatchAlerts(
  opts: { budgetMs?: number; now?: () => number } = {},
): Promise<{ sent: number; skipped: number; more: boolean }> {
  const now = opts.now ?? Date.now
  const deadline = now() + (opts.budgetMs ?? DISPATCH_MAX_SECONDS * 1000) - SAFETY_MS
  const admin = createAdminClient()
  if (!admin || !pushConfigured()) return { sent: 0, skipped: 0, more: false } // nothing claimed: nothing lost

  const fans = new Map<number, Promise<string[]>>()
  const audience = (fixtureId: number) => {
    let p = fans.get(fixtureId)
    if (!p) {
      p = recipients(admin, fixtureId)
      fans.set(fixtureId, p)
    }
    return p
  }

  let sent = 0
  let skipped = 0
  let more = false
  for (;;) {
    if (now() >= deadline) {
      more = true
      break
    }
    const { data: claimed, error } = await admin.rpc('claim_alerts', { p_limit: CLAIM_BATCH })
    if (error) console.warn('claim alerts failed', error.code)
    if (error || !claimed?.length) break
    const fresh = freshInOrder(claimed, now())
    skipped += claimed.length - fresh.length
    const described = await describeAlerts(admin, fresh)
    await Promise.all(
      groupByMatch(fresh).map(async (group) => {
        for (const alert of group) {
          const d = described.get(alert.id)
          if (!d) {
            skipped++
            continue
          }
          const to = await audience(alert.fixture_id)
          if (to.length) await sendPush(to, d.push)
          sent++
        }
      }),
    )
    if (claimed.length < CLAIM_BATCH) break
  }
  console.info(`alerts dispatched: sent=${sent} skipped=${skipped} more=${more}`)
  return { sent, skipped, more }
}
