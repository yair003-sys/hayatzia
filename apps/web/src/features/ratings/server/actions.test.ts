// @vitest-environment node
// Perf round 2 (security review): after a rating, the club's shared averages are refreshed by the club the database
// returns for the rated player (never a value from the form); when it does not come back, every club's averages are.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({
  existing: null as null | { stars: number },
  written: [] as unknown[] | null,
  error: null as null | { message: string },
  tags: [] as string[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: (t: string) => void s.tags.push(t), cacheLife: () => {}, cacheTag: () => {} }))
vi.mock('./queries', () => ({ getRecentReviews: async () => [] }))
vi.mock('@/lib/supabase/server', () => {
  const chain = (result: () => unknown): unknown => {
    const self: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'then') return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, err)
          if (prop === 'maybeSingle') return async () => ({ data: s.existing, error: null })
          return () => self
        },
      },
    )
    return self
  }
  return {
    createClient: async () => ({
      auth: { getClaims: async () => ({ data: { claims: { sub: 'me' } } }) },
      from: () => ({
        select: () => chain(() => ({ data: s.existing, error: null })),
        insert: () => chain(() => ({ data: s.written, error: s.error })),
        update: () => chain(() => ({ data: s.written, error: s.error })),
      }),
    }),
  }
})

const { ratePlayerAction } = await import('./actions')

beforeEach(() => {
  s.existing = null
  s.written = [{ players: { team_id: 'mta' } }]
  s.error = null
  s.tags = []
})

describe('ratePlayerAction refreshes the shared averages', () => {
  it('of the rated player club, as the database returns it (insert and update)', async () => {
    expect((await ratePlayerAction({ playerId: 'mta_9', stars: 4, review: '' }))?.data).toEqual({ ok: true, previous: null })
    s.existing = { stars: 2 }
    expect((await ratePlayerAction({ playerId: 'mta_9', stars: 5, review: '' }))?.data).toEqual({ ok: true, previous: 2 })
    expect(s.tags).toEqual(['rating-stats:mta', 'rating-stats:mta'])
  })
  it('of every club when the club does not come back', async () => {
    s.written = null
    await ratePlayerAction({ playerId: 'mta_9', stars: 4, review: '' })
    s.written = []
    await ratePlayerAction({ playerId: 'mta_9', stars: 4, review: '' })
    expect(s.tags).toEqual(['rating-stats', 'rating-stats'])
  })
  it('not when the write failed', async () => {
    s.error = { message: 'not_your_player' }
    expect((await ratePlayerAction({ playerId: 'mta_9', stars: 4, review: '' }))?.data).toEqual({ error: 'מדרגים רק שחקנים של הקבוצה שלך' })
    expect(s.tags).toEqual([])
  })
})
