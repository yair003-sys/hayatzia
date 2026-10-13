// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALERT_NOT_FOUND, alertExists, getBannerAlert } from './banner-alert'

const mocks = vi.hoisted(() => ({
  row: { data: null as unknown, error: null as unknown },
  admin: null as unknown,
  describeAlerts: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('./describe', () => ({ describeAlerts: mocks.describeAlerts }))

const query = { select: () => query, eq: () => query, maybeSingle: async () => mocks.row }
const alert = { id: 9, fixture_id: 77, kind: 'goal', home_goals: 1, away_goals: 0, scoring_api_id: 604 }

beforeEach(() => {
  mocks.admin = { from: () => query }
  mocks.row = { data: null, error: null }
  mocks.describeAlerts.mockReset()
})

describe('getBannerAlert', () => {
  it('an unknown alert throws (a miss must never be cached as "nothing")', async () => {
    await expect(getBannerAlert(9)).rejects.toThrow(ALERT_NOT_FOUND)
  })

  it('a read error throws, and not as "not found"', async () => {
    mocks.row = { data: null, error: { code: '57014' } }
    await expect(getBannerAlert(9)).rejects.toThrow('banner alert: read failed')
  })

  it('no server key in this environment throws', async () => {
    mocks.admin = null
    await expect(getBannerAlert(9)).rejects.toThrow('not configured')
  })

  it('returns the push text, the clubs and the colour, described strictly', async () => {
    mocks.row = { data: alert, error: null }
    mocks.describeAlerts.mockResolvedValue(
      new Map([[9, { push: { title: 'T', body: 'B', url: '/matches/77', tag: 'match:77' }, homeApiId: 604, awayApiId: 657, bar: '#FFD400' }]]),
    )
    await expect(getBannerAlert(9)).resolves.toEqual({ title: 'T', body: 'B', homeApiId: 604, awayApiId: 657, bar: '#FFD400' })
    expect(mocks.describeAlerts).toHaveBeenCalledWith(mocks.admin, [alert], { strict: true })
  })
})

describe('alertExists (uncached, error path only)', () => {
  it('true for a known alert, false for a miss, null when it cannot tell', async () => {
    mocks.row = { data: { id: 9 }, error: null }
    await expect(alertExists(9)).resolves.toBe(true)
    mocks.row = { data: null, error: null }
    await expect(alertExists(9)).resolves.toBe(false)
    mocks.row = { data: null, error: { code: '57014' } }
    await expect(alertExists(9)).resolves.toBeNull()
    mocks.admin = null
    await expect(alertExists(9)).resolves.toBeNull()
  })
})
