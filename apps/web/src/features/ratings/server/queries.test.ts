// @vitest-environment node
// Perf round 2: the club's rating totals are one shared read per club (service role, cached); each fan's own ratings
// are read per request and merged after. A failed shared read is null and thrown inside the cache (never kept).
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

const { getClubRatingStats, getSquadWithRatings } = await import('./queries')

const player = { id: 'mta_9', number: 9, name_he: 'חלאילי', name_short: 'חלאילי', position: 'ST', injured: false, in_xi: true, pitch_x: 50, pitch_y: 20 }

beforeEach(() => {
  state.config = {}
  state.admin = null
  state.pub = { tables: { players: ok([player]) } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getClubRatingStats', () => {
  it('with the service key: the club-wide rows, without the join column', async () => {
    state.admin = { tables: { player_rating_stats: ok([{ player_id: 'mta_9', sum: 9, count: 2, players: { team_id: 'mta' } }]) } }
    expect(await getClubRatingStats('mta')).toEqual([{ player_id: 'mta_9', sum: 9, count: 2 }])
  })
  it('null when the shared read fails (thrown inside the cache, so not kept), not the fan-session read', async () => {
    state.admin = { tables: { player_rating_stats: failed } }
    state.config = { tables: { player_rating_stats: ok([{ player_id: 'mta_9', sum: 1, count: 1 }]) } }
    expect(await getClubRatingStats('mta')).toBeNull()
  })
  it('service role without the grant (migration not applied yet): the fan session reads them, no error shown', async () => {
    state.admin = { tables: { player_rating_stats: { data: null, error: { code: '42501', message: 'permission denied' } } } }
    state.config = { tables: { player_rating_stats: ok([{ player_id: 'mta_9', sum: 4, count: 1 }]) } }
    expect(await getClubRatingStats('mta')).toEqual([{ player_id: 'mta_9', sum: 4, count: 1 }])
  })
  it('without a service key: the fan session reads them (RLS), as before', async () => {
    state.config = { tables: { player_rating_stats: ok([{ player_id: 'mta_9', sum: 4, count: 1 }]) } }
    expect(await getClubRatingStats('mta')).toEqual([{ player_id: 'mta_9', sum: 4, count: 1 }])
    state.config = { tables: { player_rating_stats: failed } }
    expect(await getClubRatingStats('mta')).toBeNull()
  })
})

describe('getSquadWithRatings', () => {
  it('shared squad and averages, my own stars merged per request', async () => {
    state.admin = { tables: { player_rating_stats: ok([{ player_id: 'mta_9', sum: 9, count: 2, players: { team_id: 'mta' } }]) } }
    state.config = { tables: { player_ratings: ok([{ player_id: 'mta_9', stars: 5, review: 'מלך' }]) } }
    expect(await getSquadWithRatings('mta', 'me')).toEqual([{ ...player, avg: 4.5, count: 2, myStars: 5, myReview: 'מלך' }])
    // Another fan of the club: same shared part, their own (no) rating.
    state.config = { tables: { player_ratings: ok([]) } }
    expect(await getSquadWithRatings('mta', 'other')).toEqual([{ ...player, avg: 4.5, count: 2, myStars: null, myReview: '' }])
  })
  it('a failed read falls back to empty, as before', async () => {
    state.pub = { tables: { players: failed } }
    expect(await getSquadWithRatings('mta', 'me')).toEqual([])
  })
})
