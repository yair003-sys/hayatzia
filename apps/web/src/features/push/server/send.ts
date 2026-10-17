import 'server-only'
import webpush from 'web-push'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPushEndpoint, type PushPayload } from '../schema'

/** True when this environment can send notifications (VAPID pair + server key configured). */
export function pushConfigured(): boolean {
  return !!(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.SUPABASE_SECRET_KEY)
}

let configured = false
function setup() {
  if (configured) return
  webpush.setVapidDetails('https://hayatzia-flame.vercel.app', env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!)
  configured = true
}

/** Fan ids per `.in()` filter: keeps the request URL short (a uuid is 36 characters). */
const USER_CHUNK = 200
/** Subscriptions read per page (keyset by id, under the API row cap). */
const SUB_PAGE = 1000
/** Notifications in flight at once. */
const CONCURRENCY = 50

/** Runs `fn` over `items` with at most `limit` calls in flight. */
async function eachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Sends a notification to every device of the given fans. Never throws: a failed notification must not fail
 * the action that triggered it. Subscriptions the push service reports as gone (404/410) are removed.
 * Scales to many fans: ids go in chunks, subscriptions are read page by page (keyset on id), and at most
 * CONCURRENCY notifications are in flight. Returns how many devices accepted the notification.
 */
export async function sendPush(userIds: readonly string[], payload: PushPayload): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0
  const admin = createAdminClient()
  if (!admin) return 0
  let delivered = 0
  try {
    setup()
    const body = JSON.stringify(payload)
    const gone: string[] = []
    for (const ids of chunks([...new Set(userIds)], USER_CHUNK)) {
      let after = ''
      for (;;) {
        let q = admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('user_id', ids)
        if (after) q = q.gt('id', after)
        const { data: subs, error } = await q.order('id').limit(SUB_PAGE)
        if (error) console.warn('push subscriptions read failed', error.code)
        if (error || !subs?.length) break
        await eachLimited(subs, CONCURRENCY, async (s) => {
          // Re-check the host here too (defence in depth): never send to an address that is not a real push service,
          // even if a row slipped past the database constraint. Security review 2026-10-17.
          if (!isPushEndpoint(s.endpoint)) return
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
              TTL: 60 * 60,
              urgency: 'normal',
              timeout: 3000,
            })
            delivered++
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode
            if (status === 404 || status === 410) gone.push(s.id)
          }
        })
        if (subs.length < SUB_PAGE) break
        after = subs[subs.length - 1]!.id
      }
    }
    for (const ids of chunks(gone, USER_CHUNK)) await admin.from('push_subscriptions').delete().in('id', ids)
  } catch (e) {
    console.warn('push failed', (e as { code?: string })?.code ?? 'unknown')
  }
  return delivered
}

/**
 * Like sendPush, for private messages, groups and invites: skips fans who turned message notifications off
 * (notification_prefs.messages = false; no settings row = on). If the check fails, nobody is notified, so a fan's
 * "off" is never overridden.
 */
export async function sendMessagePush(userIds: readonly string[], payload: PushPayload): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0
  const admin = createAdminClient()
  if (!admin) return 0
  const allowed: string[] = []
  try {
    for (const ids of chunks([...new Set(userIds)], 500)) {
      const { data, error } = await admin.rpc('message_push_allowed', { p_users: ids })
      if (error) return 0
      allowed.push(...(data ?? []))
    }
  } catch {
    return 0
  }
  return sendPush(allowed, payload)
}
