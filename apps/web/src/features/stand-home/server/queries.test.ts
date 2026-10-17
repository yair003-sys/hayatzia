// @vitest-environment node
// Load test 2026-10-17, finding 6: a tile count whose read failed is null (a dash and "נסה שוב"), never 0.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createClient: async () => fakeSupabase(state.config) }
})
vi.mock('@/features/ratings/server/queries', () => ({ getSquadWithRatings: async () => [] }))

const { countOf, getStandHome } = await import('./queries')

beforeEach(() => {
  state.config = { tables: { fan_events: ok(null, 2), market_items: ok(null, 3), trips: ok(null, 338), chants: ok(null, 7) } }
})

describe('countOf', () => {
  it('the count, or null when the read failed', () => {
    expect(countOf({ count: 0, error: null })).toBe(0)
    expect(countOf({ count: 5, error: null })).toBe(5)
    expect(countOf({ count: null, error: { code: 'PGRST003' } })).toBeNull()
    expect(countOf({ count: null, error: null })).toBeNull()
  })
})

describe('getStandHome', () => {
  it('every count when the reads work', async () => {
    expect(await getStandHome('mta', 'me', 1)).toMatchObject({ events: 2, market: 3, trips: 338, chants: 7 })
  })
  it('a failed count is null, the others stay', async () => {
    state.config.tables = { ...state.config.tables, trips: failed }
    expect(await getStandHome('mta', 'me', 1)).toMatchObject({ events: 2, market: 3, trips: null, chants: 7 })
  })
  it('no next match: 0 trips (a real zero)', async () => {
    expect((await getStandHome('mta', 'me', null)).trips).toBe(0)
  })
  it('the next match may still be on its way (read with the league in parallel): the same counts', async () => {
    expect(await getStandHome('mta', 'me', Promise.resolve(1))).toMatchObject({ events: 2, market: 3, trips: 338, chants: 7 })
    expect((await getStandHome('mta', 'me', Promise.resolve(null))).trips).toBe(0)
  })
})
