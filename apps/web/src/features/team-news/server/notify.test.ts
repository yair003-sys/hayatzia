import { describe, expect, it, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const sendPush = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
vi.mock('@/features/push/server/send', () => ({ sendPush: (...a: unknown[]) => sendPush(...a) }))
vi.mock('@/features/teams/data', () => ({ teamById: () => ({ short: 'מכבי ת״א' }) }))

import { notifyNewPost } from './notify'

beforeEach(() => {
  rpc.mockReset()
  sendPush.mockReset()
})

describe('notifyNewPost', () => {
  it('pages all recipients and pushes once to the union', async () => {
    const first = Array.from({ length: 1000 }, (_, i) => `u${i}`)
    const second = ['a', 'b', 'c']
    rpc.mockResolvedValueOnce({ data: first, error: null }).mockResolvedValueOnce({ data: second, error: null })
    sendPush.mockResolvedValue(1)

    await notifyNewPost('mta', { title: 'ניצחון', body: 'שבת אלופים' })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(sendPush).toHaveBeenCalledTimes(1)
    const [ids, payload] = sendPush.mock.calls[0]!
    expect(ids).toHaveLength(1003)
    expect(payload.url).toBe('/stand/chat?tab=news')
    expect(payload.title).toContain('מכבי')
  })

  it('does not push when there are no recipients', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    await notifyNewPost('mta', { title: null, body: 'אין נמענים' })
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('never throws when sendPush fails', async () => {
    rpc.mockResolvedValueOnce({ data: ['u1'], error: null })
    sendPush.mockRejectedValue(new Error('push down'))
    await expect(notifyNewPost('mta', { title: null, body: 'x' })).resolves.toBeUndefined()
  })
})
