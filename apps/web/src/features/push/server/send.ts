import 'server-only'
import webpush from 'web-push'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PushPayload } from '../schema'

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

/**
 * Sends a notification to every device of the given fans. Never throws: a failed notification must not fail
 * the action that triggered it. Subscriptions the push service reports as gone (404/410) are removed.
 */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<void> {
  if (!pushConfigured() || userIds.length === 0) return
  const admin = createAdminClient()
  if (!admin) return
  try {
    setup()
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .in('user_id', userIds)
      .limit(200)
    const gone: string[] = []
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
            { TTL: 60 * 60, urgency: 'normal' },
          )
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) gone.push(s.id)
        }
      }),
    )
    if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone)
  } catch (e) {
    console.warn('push failed', e)
  }
}
