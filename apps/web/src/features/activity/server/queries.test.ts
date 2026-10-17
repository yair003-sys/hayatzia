// @vitest-environment node
// Load test 2026-10-17, finding 6: a failed read is "could not load" (null), never a 0 or an empty list.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig, blocked: [] as string[] | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createClient: async () => fakeSupabase(state.config) }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => null }))
vi.mock('@/features/safety/server/queries', () => ({ getBlockedIdsOrNull: async () => state.blocked }))

const { getActivityPage, getUnreadCount } = await import('./queries')

const ME = '11111111-1111-4111-8111-111111111111'
const row = { id: 1, kind: 'clip_like', actor_id: null, actor_count: 2, updated_at: new Date().toISOString(), trip_id: null, clips: null, team_photos: null, trips: null }

beforeEach(() => {
  state.config = {}
  state.blocked = []
})

describe('getUnreadCount', () => {
  it('the number when the read works', async () => {
    state.config = { rpc: { activity_unread_count: ok(5) } }
    expect(await getUnreadCount()).toBe(5)
  })
  it('null (not 0) when the read fails', async () => {
    state.config = { rpc: { activity_unread_count: failed } }
    expect(await getUnreadCount()).toBeNull()
  })
})

describe('getActivityPage', () => {
  it('the rows when the reads work', async () => {
    state.config = { tables: { activity: ok([row]), activity_seen: ok(null) } }
    const page = await getActivityPage(ME)
    expect(page?.items).toHaveLength(1)
  })
  it('an empty list only when the database has no rows', async () => {
    state.config = { tables: { activity: ok([]), activity_seen: ok(null) } }
    expect(await getActivityPage(ME)).toEqual({ items: [], next: null, seenAt: null, newestAt: null })
  })
  it('null when the list read fails', async () => {
    state.config = { tables: { activity: failed, activity_seen: ok(null) } }
    expect(await getActivityPage(ME)).toBeNull()
  })
  it('null when the last visit cannot be read (the highlight would be wrong)', async () => {
    state.config = { tables: { activity: ok([row]), activity_seen: failed } }
    expect(await getActivityPage(ME)).toBeNull()
  })
  it('null when the blocked fans cannot be read', async () => {
    state.config = { tables: { activity: ok([row]), activity_seen: ok(null) } }
    state.blocked = null
    expect(await getActivityPage(ME)).toBeNull()
  })
})
