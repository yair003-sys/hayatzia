// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const mocks = vi.hoisted(() => ({
  env: { ALERTS_SECRET: undefined as string | undefined },
  createAdminClient: vi.fn((): null => null),
  sendPush: vi.fn(async () => {}),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: mocks.env }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/features/push/server/send', () => ({ sendPush: mocks.sendPush, pushConfigured: () => true }))

const SECRET = 's'.repeat(40)
const req = (auth?: string) =>
  new Request('http://localhost/api/alerts/dispatch', { method: 'POST', headers: auth ? { authorization: auth } : {} })

beforeEach(() => {
  mocks.env.ALERTS_SECRET = SECRET
  mocks.createAdminClient.mockClear()
  mocks.sendPush.mockClear()
})

describe('POST /api/alerts/dispatch', () => {
  it('401 without a secret, and nothing is read or sent', async () => {
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.sendPush).not.toHaveBeenCalled()
  })

  it('401 with the wrong secret (same length and different length)', async () => {
    expect((await POST(req(`Bearer ${'x'.repeat(40)}`))).status).toBe(401)
    expect((await POST(req('Bearer short'))).status).toBe(401)
    expect((await POST(req(SECRET))).status).toBe(401) // no "Bearer " prefix
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.sendPush).not.toHaveBeenCalled()
  })

  it('401 when ALERTS_SECRET is not configured, even with an empty bearer', async () => {
    mocks.env.ALERTS_SECRET = undefined
    expect((await POST(req('Bearer '))).status).toBe(401)
    expect((await POST(req('Bearer undefined'))).status).toBe(401)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('with the right secret it runs (no database here → nothing sent)', async () => {
    const res = await POST(req(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: 0, skipped: 0 })
    expect(mocks.createAdminClient).toHaveBeenCalledOnce()
    expect(mocks.sendPush).not.toHaveBeenCalled()
  })
})
