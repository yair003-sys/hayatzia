// @vitest-environment node
// Load test 2026-10-17, finding 6: a failed Square read is null ("could not load"), never "the Square is empty", and a
// post whose likes could not be read is not shown as "not liked".
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig, blocked: [] as string[] | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createClient: async () => fakeSupabase(state.config) }
})
vi.mock('@/features/safety/server/queries', () => ({ getBlockedIdsOrNull: async () => state.blocked }))

const { getSquareFeed } = await import('./queries')

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
const working = () => ({ clips: ok([clip]), clip_likes: ok([{ clip_id: 'c1' }]), clip_respects: ok([]) })

beforeEach(() => {
  state.config = { me: ME, tables: working(), signed: ok([{ path: 'p/c1.jpg', signedUrl: 'https://local/x' }]) }
  state.blocked = []
})

describe('getSquareFeed', () => {
  it('the posts with my like when every read works', async () => {
    const feed = await getSquareFeed()
    expect(feed?.map((c) => [c.id, c.liked, c.url])).toEqual([['c1', true, 'https://local/x']])
  })
  it('an empty list only when there are no posts', async () => {
    state.config.tables = { ...working(), clips: ok([]) }
    expect(await getSquareFeed()).toEqual([])
  })
  it('null when the posts read fails', async () => {
    state.config.tables = { ...working(), clips: failed }
    expect(await getSquareFeed()).toBeNull()
  })
  it('null when the blocked fans cannot be read', async () => {
    state.blocked = null
    expect(await getSquareFeed()).toBeNull()
  })
  it('null when my likes cannot be read (the hearts would be wrong)', async () => {
    state.config.tables = { ...working(), clip_likes: failed }
    expect(await getSquareFeed()).toBeNull()
  })
  it('null when the pictures cannot be signed', async () => {
    state.config.signed = failed
    expect(await getSquareFeed()).toBeNull()
  })
})
