import { z } from 'zod'

export const subscriptionSchema = z.object({
  endpoint: z.url().startsWith('https://').max(999),
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
