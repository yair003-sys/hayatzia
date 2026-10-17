// @vitest-environment node
// Load test 2026-10-17: a failed profile read sent a signed-in fan to onboarding (and from there back to the home).
// A failed read is now its own status, never "no profile".
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failed, ok, type FakeConfig } from '@/test-utils/fake-supabase'

const state = vi.hoisted(() => ({ config: {} as FakeConfig }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeSupabase } = await import('@/test-utils/fake-supabase')
  return { createClient: async () => fakeSupabase(state.config) }
})

const ME = '11111111-1111-4111-8111-111111111111'
// A fresh module per case (the helper is memoised per request).
const load = async () => {
  vi.resetModules()
  return (await import('./queries')).getSessionProfile
}

beforeEach(() => {
  state.config = { me: ME }
})

describe('getSessionProfile', () => {
  it('ready with a profile', async () => {
    state.config.tables = { profiles: ok({ nick: 'דני', team_id: 'mta' }) }
    expect(await (await load())()).toMatchObject({ status: 'ready', userId: ME, nick: 'דני' })
  })
  it('no-profile only when the read worked and found nothing', async () => {
    state.config.tables = { profiles: ok(null) }
    expect(await (await load())()).toEqual({ status: 'no-profile', userId: ME })
  })
  it('error (not no-profile) when the read fails', async () => {
    state.config.tables = { profiles: failed }
    expect(await (await load())()).toEqual({ status: 'error', userId: ME })
  })
  it('signed-out without a session', async () => {
    state.config.me = null
    expect(await (await load())()).toEqual({ status: 'signed-out' })
  })
})
