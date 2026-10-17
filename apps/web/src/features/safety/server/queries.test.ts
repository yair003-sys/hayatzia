// @vitest-environment node
// Load test 2026-10-17, finding 6: a screen that cannot read whom the fan blocked must not show those fans.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createClient: async () => fakeSupabase(state.config) }
})

// A fresh module per case (the helpers are memoised per request).
const load = async () => {
  vi.resetModules()
  return import('./queries')
}

beforeEach(() => {
  state.config = {}
})

describe('blocked fans', () => {
  it('the ids when the read works', async () => {
    state.config = { tables: { blocks: ok([{ blocked_id: 'a' }, { blocked_id: 'b' }]) } }
    const q = await load()
    expect(await q.getBlockedIdsOrNull()).toEqual(['a', 'b'])
  })
  it('null when the read fails; the old helper still answers a list', async () => {
    state.config = { tables: { blocks: failed } }
    const q = await load()
    expect(await q.getBlockedIdsOrNull()).toBeNull()
    expect(await q.getBlockedIds()).toEqual([])
  })
})
