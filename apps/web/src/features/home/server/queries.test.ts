// @vitest-environment node
// Load test 2026-10-17, finding 6: a home section whose read failed returns null ("could not load"), never the empty
// state ("no posts yet", "the chat is quiet"), and a cached club number is not kept in the cache when its read failed.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig, admin: null as FakeConfig | null, blocked: [] as string[] | null }))
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
vi.mock('@/features/safety/server/queries', () => ({ getBlockedIdsOrNull: async () => state.blocked }))

const { getActiveFans, getChatPreview, getFansOfWeek, getHomePlayers, getHotClips, getStories } = await import('./queries')

const ME = '11111111-1111-4111-8111-111111111111'
const clip = {
  id: 'c1',
  user_id: '22222222-2222-4222-8222-222222222222',
  team_id: 'mta',
  nick: 'צלם',
  media_path: 'p/c1.jpg',
  kind: 'image',
  caption: '',
  tags: [],
  once: false,
  likes_count: 3,
  respects_count: 0,
  comments_count: 0,
  views_count: 0,
  created_at: '2026-10-17T10:00:00Z',
  expires_at: '2026-10-18T10:00:00Z',
  audience: 'all',
}

beforeEach(() => {
  state.config = { me: ME, tables: { clips: ok([{ ...clip, clip_views: [] }]), clip_likes: ok([]), clip_respects: ok([]) } }
  state.admin = null
  state.blocked = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('stories and hot posts', () => {
  it('the posts when the reads work', async () => {
    expect((await getStories('mta', ME))?.map((g) => g.userId)).toEqual([clip.user_id])
    expect((await getHotClips(ME))?.map((c) => c.id)).toEqual(['c1'])
  })
  it('null when the posts read fails', async () => {
    state.config.tables = { ...state.config.tables, clips: failed }
    expect(await getStories('mta', ME)).toBeNull()
    expect(await getHotClips(ME)).toBeNull()
  })
  it('null when the blocked fans cannot be read', async () => {
    state.blocked = null
    expect(await getStories('mta', ME)).toBeNull()
    expect(await getHotClips(ME)).toBeNull()
  })
  it('null when my likes on the posts cannot be read', async () => {
    state.config.tables = { ...state.config.tables, clip_likes: failed }
    expect(await getStories('mta', ME)).toBeNull()
    expect(await getHotClips(ME)).toBeNull()
  })
})

describe('getHomePlayers', () => {
  const player = { id: 'mta_1', number: 1, name_short: 'מליקה', position: 'GK', player_rating_stats: { sum: 8, count: 2 } }
  it('the squad when the reads work', async () => {
    state.config = { tables: { players: ok([player]) }, rpc: { home_player_reviews: ok([]) } }
    expect((await getHomePlayers('mta', ME))?.map((p) => [p.id, p.count])).toEqual([['mta_1', 2]])
  })
  it('null when the squad or the reviews cannot be read', async () => {
    state.config = { tables: { players: failed }, rpc: { home_player_reviews: ok([]) } }
    expect(await getHomePlayers('mta', ME)).toBeNull()
    state.config = { tables: { players: ok([player]) }, rpc: { home_player_reviews: failed } }
    expect(await getHomePlayers('mta', ME)).toBeNull()
  })
})

describe('getChatPreview', () => {
  const m = { id: 'm1', user_id: 'u1', nick: 'n', body: 'שלום', created_at: '2026-10-17T10:00:00Z' }
  it('the last messages when the reads work', async () => {
    state.config = { tables: { team_messages: ok([m]) } }
    expect((await getChatPreview('mta'))?.messages.map((x) => x.id)).toEqual(['m1'])
  })
  it('null (not "the chat is quiet") when the read fails', async () => {
    state.config = { tables: { team_messages: failed } }
    expect(await getChatPreview('mta')).toBeNull()
  })
  it('null when the blocked fans cannot be read', async () => {
    state.config = { tables: { team_messages: ok([m]) } }
    state.blocked = null
    expect(await getChatPreview('mta')).toBeNull()
  })
})

describe('club numbers (service role, cached)', () => {
  it('the numbers when the reads work', async () => {
    state.admin = { rpc: { home_active_fans: ok(42), home_fans_of_week: ok([{ nick: 'א', points: 9 }]) } }
    expect(await getActiveFans('mta')).toBe(42)
    expect(await getFansOfWeek('mta')).toEqual([{ nick: 'א', points: 9 }])
  })
  it('null when the read fails (the cached part throws, so the failure is not cached)', async () => {
    state.admin = { rpc: { home_active_fans: failed, home_fans_of_week: failed } }
    expect(await getActiveFans('mta')).toBeNull()
    expect(await getFansOfWeek('mta')).toBeNull()
  })
  it('without the service key: a dash for active fans, the empty list for fans of the week (as before)', async () => {
    expect(await getActiveFans('mta')).toBeNull()
    expect(await getFansOfWeek('mta')).toEqual([])
  })
})
