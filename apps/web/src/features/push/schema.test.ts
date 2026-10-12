import { describe, expect, it } from 'vitest'
import { subscriptionSchema, vapidKeyBytes } from './schema'

describe('push', () => {
  it('decodes a URL-safe base64 VAPID key', () => {
    expect([...vapidKeyBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239])
  })
  it('only accepts https endpoints', () => {
    const keys = { p256dh: 'x'.repeat(20), auth: 'abcd' }
    expect(subscriptionSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/x', keys }).success).toBe(true)
    expect(subscriptionSchema.safeParse({ endpoint: 'http://evil/x', keys }).success).toBe(false)
  })
})
