// @vitest-environment node
// Review of perf-fixes (2026-10-17): trips, events and market must never show a blocked fan's post because the blocks
// read failed. A failed read is null ("could not load"), never the list without the filter.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig, blocked: [] as string[] | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createClient: async () => fakeSupabase(state.config) }
})
vi.mock('@/features/safety/server/queries', () => ({ getBlockedIdsOrNull: async () => state.blocked }))

const { getMarket, getTrips, getUpcomingEvents } = await import('./queries')

const A = '22222222-2222-4222-8222-222222222222'
const B = '33333333-3333-4333-8333-333333333333'
const trip = (id: string, user_id: string) => ({
  id,
  user_id,
  nick: 'n',
  fixture_id: 1,
  kind: 'meet',
  from_city: 'חיפה',
  depart_before_min: 120,
  seats: 0,
  cost: 'share',
  note: '',
  pickup: 'תחנה',
  women_only: false,
  created_at: '2026-10-17T10:00:00Z',
})
const event = (id: string, user_id: string) => ({ id, user_id, nick: 'n', kind: 'meet', title: 't', starts_at: '2026-10-18T10:00:00Z', area: 'a', note: '', going_count: 0 })
const item = (id: string, user_id: string) => ({ id, user_id, nick: 'n', category: 'shirt', title: 't', size: 'M', condition: 'used', price: 1, sold: false, created_at: '2026-10-17T10:00:00Z', media_path: null })

beforeEach(() => {
  state.blocked = [B]
  state.config = {
    tables: {
      trips: ok([trip('t1', A), trip('t2', B)]),
      trip_requests: ok([]),
      fan_events: ok([event('e1', A), event('e2', B)]),
      fan_event_going: ok([]),
      market_items: ok([item('m1', A), item('m2', B)]),
    },
  }
})

describe('team life boards', () => {
  it('hide blocked fans when the blocks read works', async () => {
    expect((await getTrips([1]))?.map((t) => t.id)).toEqual(['t1'])
    expect((await getUpcomingEvents())?.map((e) => e.id)).toEqual(['e1'])
    expect((await getMarket())?.map((i) => i.id)).toEqual(['m1'])
  })
  it('null when the blocks read fails (never the unfiltered list)', async () => {
    state.blocked = null
    expect(await getTrips([1])).toBeNull()
    expect(await getUpcomingEvents()).toBeNull()
    expect(await getMarket()).toBeNull()
  })
  it('null when the board itself cannot be read', async () => {
    state.config.tables = { ...state.config.tables, trips: failed, fan_events: failed, market_items: failed }
    expect(await getTrips([1])).toBeNull()
    expect(await getUpcomingEvents()).toBeNull()
    expect(await getMarket()).toBeNull()
  })
})
