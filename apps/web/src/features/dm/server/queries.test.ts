// @vitest-environment node
// Load test 2026-10-17, finding 6: the inbox showed 1 chat instead of 5 when one of its reads failed. Now any failed
// read makes the whole inbox "could not load" (null), never a partial list.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createClient: async () => fakeSupabase(state.config) }
})

const { getInbox } = await import('./queries')

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const thread = {
  id: 't1',
  user_a: ME,
  user_b: OTHER,
  nick_a: 'אני',
  nick_b: 'הוא',
  team_a: 'mta',
  team_b: 'mta',
  last_at: '2026-10-17T10:00:00Z',
  last_from: OTHER,
  last_message_id: 'm1',
  unread_a: 2,
  unread_b: 0,
  accepted_at: '2026-10-17T09:00:00Z',
  opened_by: ME,
}
const working = () => ({ dm_threads: ok([thread]), dm_group_members: ok([]), blocks: ok([]) })

beforeEach(() => {
  state.config = { tables: working() }
})

describe('getInbox', () => {
  it('the chats when every read works', async () => {
    const inbox = await getInbox(ME)
    expect(inbox?.rows.map((r) => [r.id, r.unread])).toEqual([['t1', 2]])
  })
  it.each(['dm_threads', 'dm_group_members', 'blocks'] as const)('null when the %s read fails', async (table) => {
    state.config = { tables: { ...working(), [table]: failed } }
    expect(await getInbox(ME)).toBeNull()
  })
})
