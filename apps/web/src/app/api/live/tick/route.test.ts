// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: {
    API_FOOTBALL_KEY: undefined as string | undefined,
    CRON_SECRET: undefined as string | undefined,
    ALERTS_SECRET: undefined as string | undefined,
    SEASON: undefined as number | undefined,
    LEAGUE: undefined as number | undefined,
  },
  createAdminClient: vi.fn(),
  dispatchAlerts: vi.fn(async () => ({ sent: 0, skipped: 0, more: false })),
  fetch: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: mocks.env }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
// Keep the real bearerOk (constant-time compare); only stub the push dispatch.
vi.mock('@/features/push/server/dispatch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/push/server/dispatch')>()
  return { ...actual, dispatchAlerts: mocks.dispatchAlerts }
})

const { GET, POST } = await import('./route')

const CRON = 'c'.repeat(32)
const ALERTS = 'a'.repeat(40)
const KEY = 'secret-api-football-key'

const req = (auth?: string, method = 'POST') =>
  new Request('http://localhost/api/live/tick', { method, headers: auth ? { authorization: auth } : {} })

/** A fake admin client: fixtures read returns `readRows`, every upsert is recorded in `upserts`. */
function fakeAdmin(readRows: Array<{ id: number; status: string; kickoff_at: string }>, readError: unknown = null) {
  const upserts: Array<{ table: string; rows: unknown[]; opts?: unknown }> = []
  const client = {
    from(table: string) {
      return {
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: readRows, error: readError }) }) }),
        upsert: (rows: unknown[], opts?: unknown) => {
          upserts.push({ table, rows, opts })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { client, upserts }
}

beforeEach(() => {
  mocks.env.API_FOOTBALL_KEY = KEY
  mocks.env.CRON_SECRET = CRON
  mocks.env.ALERTS_SECRET = ALERTS
  mocks.env.SEASON = 2025
  mocks.env.LEAGUE = 383
  mocks.createAdminClient.mockReset()
  mocks.dispatchAlerts.mockClear()
  mocks.fetch.mockReset()
  vi.stubGlobal('fetch', mocks.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth', () => {
  it('401 without a bearer, and no API call or db access', async () => {
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('401 with a wrong token', async () => {
    expect((await POST(req(`Bearer ${'x'.repeat(32)}`))).status).toBe(401)
    expect((await POST(req(CRON))).status).toBe(401) // missing "Bearer " prefix
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('401 when no secret is configured at all, even with an empty bearer', async () => {
    mocks.env.CRON_SECRET = undefined
    mocks.env.ALERTS_SECRET = undefined
    expect((await POST(req('Bearer '))).status).toBe(401)
    expect((await POST(req('Bearer undefined'))).status).toBe(401)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('accepts either CRON_SECRET or ALERTS_SECRET', async () => {
    mocks.env.API_FOOTBALL_KEY = undefined // stop right after auth
    expect((await POST(req(`Bearer ${CRON}`))).status).toBe(200)
    expect((await POST(req(`Bearer ${ALERTS}`))).status).toBe(200)
  })
})

describe('safe dormant state', () => {
  it('skips with no key and makes no API call (safe to deploy before the key is set)', async () => {
    mocks.env.API_FOOTBALL_KEY = undefined
    const res = await POST(req(`Bearer ${CRON}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ skipped: 'no key' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

describe('live gate (cost control)', () => {
  it('makes ZERO API-Football calls when no fixture is live or in the kickoff window', async () => {
    const past = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() // 6h ago, finished
    const { client } = fakeAdmin([{ id: 1, status: 'FT', kickoff_at: past }])
    mocks.createAdminClient.mockReturnValue(client)

    const res = await POST(req(`Bearer ${CRON}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ skipped: 'no live match' })
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.dispatchAlerts).not.toHaveBeenCalled()
  })

  it('runs the API + upserts in ingest order + dispatches when a match is live (GET, as Vercel Cron sends)', async () => {
    const now = new Date().toISOString()
    const { client, upserts } = fakeAdmin([{ id: 111, status: '2H', kickoff_at: now }])
    mocks.createAdminClient.mockReturnValue(client)

    const liveFixture = {
      fixture: { id: 111, timestamp: 1_760_000_000, status: { short: '2H', elapsed: 70 }, venue: { name: 'Arena' } },
      league: { id: 383, season: 2025, round: 'R7' },
      teams: { home: { id: 10, name: 'Home', logo: '' }, away: { id: 20, name: 'Away', logo: '' } },
      goals: { home: 1, away: 0 },
    }
    const goalEvent = { time: { elapsed: 30, extra: null }, team: { id: 10 }, player: { name: 'Scorer' }, type: 'Goal', detail: 'Normal Goal' }
    mocks.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ response: [liveFixture] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ response: [goalEvent] }) })

    const res = await GET(req(`Bearer ${CRON}`, 'GET'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ live: 1, events: 1, fixtures: 1 })

    // Two API calls: one fixtures list + one events call for the single live fixture.
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.fetch.mock.calls[0]![0]).toContain('/fixtures?league=383&season=2025&live=all')
    expect(mocks.fetch.mock.calls[1]![0]).toContain('/fixtures/events?fixture=111')
    // Never leak the key in the URL; it travels in the header.
    expect(mocks.fetch.mock.calls[0]![0]).not.toContain(KEY)

    // Ingest order: api_teams, fixtures (insert only), fixture_details (events), fixtures (merge).
    expect(upserts.map((u) => u.table)).toEqual(['api_teams', 'fixtures', 'fixture_details', 'fixtures'])
    expect(upserts[1]!.opts).toMatchObject({ ignoreDuplicates: true })
    expect(upserts[3]!.opts).not.toMatchObject({ ignoreDuplicates: true })
    const detail = (upserts[2]!.rows as Array<{ fixture_id: number; events: unknown; lineups?: unknown }>)[0]!
    expect(detail.fixture_id).toBe(111)
    expect(detail).not.toHaveProperty('lineups') // never clobber the 10-minute pipeline's lineups
    expect(detail.events).toEqual([{ m: 30, x: 0, team: 10, p: 'Scorer', as: '', type: 'Goal', det: 'Normal Goal' }])

    expect(mocks.dispatchAlerts).toHaveBeenCalledOnce()
  })

  it('does not throw and does not write when the API errors (graceful)', async () => {
    const now = new Date().toISOString()
    const { client, upserts } = fakeAdmin([{ id: 111, status: '1H', kickoff_at: now }])
    mocks.createAdminClient.mockReturnValue(client)
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })

    const res = await POST(req(`Bearer ${CRON}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ error: 'api', status: 429 })
    expect(upserts).toHaveLength(0)
    expect(mocks.dispatchAlerts).not.toHaveBeenCalled()
  })
})
