import { z } from 'zod'

/** The browsers' push services (Chrome/Android/Samsung, Firefox, Safari, Edge). Any other address is refused, so the
 *  server never sends requests to an address a fan picked (security review 2026-10-15). */
export const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'] as const
export function isPushEndpoint(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.port) return false
    return PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

export const subscriptionSchema = z.object({
  endpoint: z.url().startsWith('https://').max(999).refine(isPushEndpoint, 'not a push service'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
})
export const endpointSchema = z.object({ endpoint: z.url().max(999) })

export type PushPayload = { title: string; body: string; url: string; tag?: string }

/** Turns a URL-safe base64 VAPID key into the bytes PushManager.subscribe expects. */
export function vapidKeyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** A fan's notification settings ("הכרטיס שלי" → הגדרות). No saved row = the defaults. */
export const MATCH_PREFS = ['all', 'team', 'off'] as const
export const prefsSchema = z.object({ matches: z.enum(MATCH_PREFS), messages: z.boolean() })
export type NotificationPrefs = z.infer<typeof prefsSchema>
export const DEFAULT_PREFS: NotificationPrefs = { matches: 'all', messages: true }

/** Reads a stored row defensively (the column is text in the database). */
export function toPrefs(row: { matches: string; messages: boolean } | null | undefined): NotificationPrefs {
  if (!row) return DEFAULT_PREFS
  const parsed = prefsSchema.safeParse(row)
  return parsed.success ? parsed.data : { ...DEFAULT_PREFS, messages: row.messages !== false }
}
