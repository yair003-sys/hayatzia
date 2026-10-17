// @vitest-environment node
// Perf round 2 (security review): the shared player-of-the-match totals are refreshed whenever at least one score was
// written, also when a later write of the same save fails; never when nothing was written.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({
  existing: [] as { player_id: string; score: number }[],
  insertError: null as null | { message: string },
  updateError: null as null | { message: string },
  tags: [] as string[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: (t: string) => void s.tags.push(t) }))
vi.mock('@/lib/supabase/server', () => {
  // Every chained call returns the same thenable; awaiting it answers what that kind of call answers.
  const chain = (result: () => unknown): unknown => {
    const self: unknown = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === 'then' ? (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, err) : () => self,
      },
    )
    return self
  }
  return {
    createClient: async () => ({
      from: () => ({
        select: () => chain(() => ({ data: s.existing, error: null })),
        insert: () => chain(() => ({ error: s.insertError })),
        update: () => chain(() => ({ error: s.updateError })),
      }),
    }),
  }
})

const { rateMatchAction } = await import('./actions')

const save = (ratings: { playerId: string; score: number }[]) => rateMatchAction({ fixtureId: 7, ratings })

beforeEach(() => {
  s.existing = [{ player_id: 'mta_9', score: 6 }]
  s.insertError = null
  s.updateError = null
  s.tags = []
})

describe('rateMatchAction refreshes the shared totals', () => {
  it('after a save that wrote', async () => {
    const r = await save([{ playerId: 'mta_1', score: 8 }, { playerId: 'mta_9', score: 7 }])
    expect(r?.data).toEqual({ ok: true })
    expect(s.tags).toEqual(['match-ratings:7'])
  })
  it('new scores inserted, a later update failed: the error, and the totals still refreshed', async () => {
    s.updateError = { message: 'boom' }
    const r = await save([{ playerId: 'mta_1', score: 8 }, { playerId: 'mta_9', score: 7 }])
    expect(r?.data).toEqual({ error: 'הדירוג לא נשמר' })
    expect(s.tags).toEqual(['match-ratings:7'])
  })
  it('nothing written (the insert failed first, or no change): no refresh', async () => {
    s.insertError = { message: 'not_finished' }
    await save([{ playerId: 'mta_1', score: 8 }])
    await save([{ playerId: 'mta_9', score: 6 }])
    expect(s.tags).toEqual([])
  })
})
