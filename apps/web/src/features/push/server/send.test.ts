// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Security review 2026-10-17: the sender re-checks the endpoint host before sending, and uses a 3 s timeout.
const sent = vi.hoisted(() => ({ calls: [] as { endpoint: string; timeout: number | undefined }[] }))
const db = vi.hoisted(() => ({ subs: [] as { id: string; endpoint: string; p256dh: string; auth: string }[] }))

vi.mock('server-only', () => ({}))
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, _body: string, opts: { timeout?: number }) => {
      sent.calls.push({ endpoint: sub.endpoint, timeout: opts.timeout })
      return {}
    },
  },
}))
vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SUPABASE_SECRET_KEY: 'sec' },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        in: () => q,
        gt: () => q,
        order: () => q,
        limit: async () => ({ data: db.subs, error: null }),
        delete: () => ({ in: async () => ({ error: null }) }),
      }
      return q
    },
  }),
}))

import { sendPush } from './send'

beforeEach(() => {
  sent.calls = []
  db.subs = []
})

describe('sendPush', () => {
  it('skips an endpoint that is not a real push service, and sends the valid one with a 3 s timeout', async () => {
    db.subs = [
      { id: '1', endpoint: 'https://fcm.googleapis.com/ok', p256dh: 'k', auth: 'a' },
      { id: '2', endpoint: 'https://evil.example/x', p256dh: 'k', auth: 'a' },
    ]
    const delivered = await sendPush(['u1'], { title: 't', body: 'b', url: '/x' })
    expect(sent.calls).toEqual([{ endpoint: 'https://fcm.googleapis.com/ok', timeout: 3000 }])
    expect(delivered).toBe(1)
  })
})
