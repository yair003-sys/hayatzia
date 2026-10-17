// @vitest-environment node
// Load test 2026-10-17, finding 6: the team chat opened with 2 messages instead of 50 when its history read failed.
// A failed read is now null ("could not load"), never an empty history.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createClient: async () => fakeSupabase(state.config) }
})

const { getTeamMessages } = await import('./queries')
const { getMatchMessages } = await import('@/features/match-room/server/queries')

const msg = (id: string) => ({ id, user_id: 'u', nick: 'n', body: 'b', created_at: '2026-10-17T10:00:00Z', reply_to: null, reply_user: null, reply_nick: null, reply_body: null })

beforeEach(() => {
  state.config = {}
})

describe('getTeamMessages', () => {
  it('oldest first when the read works', async () => {
    state.config = { tables: { team_messages: ok([msg('b'), msg('a')]) } }
    expect((await getTeamMessages())?.map((m) => m.id)).toEqual(['a', 'b'])
  })
  it('an empty list only when the chat has no messages', async () => {
    state.config = { tables: { team_messages: ok([]) } }
    expect(await getTeamMessages()).toEqual([])
  })
  it('null when the read fails (first page and older pages)', async () => {
    state.config = { tables: { team_messages: failed } }
    expect(await getTeamMessages()).toBeNull()
    expect(await getTeamMessages({ createdAt: '2026-10-17T10:00:00Z', id: 'x' })).toBeNull()
  })
})

describe('getMatchMessages', () => {
  it('oldest first, with the side, when the read works', async () => {
    state.config = { tables: { match_messages: ok([{ ...msg('b'), side: 'a' }, { ...msg('a'), side: 'h' }]) } }
    expect((await getMatchMessages(1))?.map((m) => `${m.id}${m.side}`)).toEqual(['ah', 'ba'])
  })
  it('null when the read fails', async () => {
    state.config = { tables: { match_messages: failed } }
    expect(await getMatchMessages(1)).toBeNull()
  })
})
