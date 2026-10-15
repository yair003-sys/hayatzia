import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, prefsSchema, subscriptionSchema, toPrefs, vapidKeyBytes } from './schema'

describe('push', () => {
  it('decodes a URL-safe base64 VAPID key', () => {
    expect([...vapidKeyBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239])
  })
  it('only accepts https endpoints', () => {
    const keys = { p256dh: 'x'.repeat(20), auth: 'abcd' }
    expect(subscriptionSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/x', keys }).success).toBe(true)
    expect(subscriptionSchema.safeParse({ endpoint: 'http://evil/x', keys }).success).toBe(false)
    // Security review 2026-10-15: only the browsers' push services, never an address a fan picks.
    for (const ok of ['https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-db5p.notify.windows.com/w/?token=x'])
      expect(subscriptionSchema.safeParse({ endpoint: ok, keys }).success).toBe(true)
    for (const bad of ['https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://10.0.0.1/x', 'https://fcm.googleapis.com:8443/x'])
      expect(subscriptionSchema.safeParse({ endpoint: bad, keys }).success).toBe(false)
  })
})

describe('notification prefs', () => {
  it('no row → all matches, messages on', () => {
    expect(toPrefs(null)).toEqual({ matches: 'all', messages: true })
    expect(DEFAULT_PREFS).toEqual({ matches: 'all', messages: true })
  })
  it('keeps a stored row; an unknown matches value falls back to all', () => {
    expect(toPrefs({ matches: 'team', messages: false })).toEqual({ matches: 'team', messages: false })
    expect(toPrefs({ matches: 'weird', messages: false })).toEqual({ matches: 'all', messages: false })
  })
  it('only accepts the three match settings', () => {
    expect(prefsSchema.safeParse({ matches: 'off', messages: true }).success).toBe(true)
    expect(prefsSchema.safeParse({ matches: 'some', messages: true }).success).toBe(false)
  })
})
