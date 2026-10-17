// @vitest-environment node
// Perf round 2: the fans' lineup totals and the winning formation's tallies are shared per match and club (service
// role, cached); only the fan's own lineup is read per request. Read errors stay "nothing yet", as before.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig, admin: null as FakeConfig | null, pub: {} as FakeConfig }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createClient: async () => fakeSupabase(state.config) }
})
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createAdminClient: () => (state.admin ? fakeSupabase(state.admin) : null) }
})
vi.mock('@/lib/supabase/public', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createPublicClient: () => fakeSupabase(state.pub) }
})

const { getFanLineup, getLineupAggregates } = await import('./queries')

const totals = { fans: 3, formations: { '4-3-3': 3 } }
const tallies = [{ formation: '4-3-3', slot: 0, player_id: 'mta_1', picks: 3 }]
const gk = { id: 'mta_1', number: 1, name_he: 'מליקה', name_short: 'מליקה', position: 'GK', injured: false, in_xi: true, pitch_x: 50, pitch_y: 90 }

beforeEach(() => {
  state.config = {}
  state.admin = null
  state.pub = { tables: { players: ok([gk]) } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getLineupAggregates', () => {
  it('with the service key: the club totals and the top formation tallies', async () => {
    state.admin = { tables: { fan_lineup_totals: ok(totals), fan_lineup_tallies: ok(tallies) } }
    expect(await getLineupAggregates(7, 'mta')).toEqual({ counts: { fans: 3, formations: { '4-3-3': 3 } }, tallies })
  })
  it('nobody saved yet: no counts, no tallies read', async () => {
    state.admin = { tables: { fan_lineup_totals: ok(null), fan_lineup_tallies: failed } }
    expect(await getLineupAggregates(7, 'mta')).toEqual({ counts: null, tallies: [] })
  })
  it('a failed shared read is "nothing yet" (thrown inside the cache, so not kept)', async () => {
    state.admin = { tables: { fan_lineup_totals: failed } }
    expect(await getLineupAggregates(7, 'mta')).toEqual({ counts: null, tallies: [] })
    state.admin = { tables: { fan_lineup_totals: ok(totals), fan_lineup_tallies: failed } }
    expect(await getLineupAggregates(7, 'mta')).toEqual({ counts: null, tallies: [] })
  })
  it('without a service key: the fan session reads the same rows', async () => {
    state.config = { tables: { fan_lineup_totals: ok(totals), fan_lineup_tallies: ok(tallies) } }
    expect(await getLineupAggregates(7, 'mta')).toEqual({ counts: { fans: 3, formations: { '4-3-3': 3 } }, tallies })
  })
})

describe('getFanLineup', () => {
  it('the shared squad and fans XI, with my own lineup per request', async () => {
    state.admin = { tables: { fan_lineup_totals: ok(totals), fan_lineup_tallies: ok(tallies) } }
    state.config = { tables: { fan_lineups: ok(null) } }
    const data = await getFanLineup(7, 'mta', 'me', false)
    expect(data.squad.map((p) => p.id)).toEqual(['mta_1'])
    expect(data.mine).toBeNull()
    expect(data.fans).not.toBeNull()
    expect(data.ratings).toBeNull()
  })
  it('after the match: the club ratings from the shared per-match read', async () => {
    state.admin = { tables: { fan_lineup_totals: ok(null), match_rating_stats: ok([{ player_id: 'mta_1', sum: 17, count: 2, players: { team_id: 'mta' } }]) } }
    expect((await getFanLineup(7, 'mta', 'me', true)).ratings).toEqual({ mta_1: 8.5 })
  })
})
