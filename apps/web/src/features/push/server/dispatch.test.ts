// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchAlerts } from './dispatch'

type Row = { id: number; fixture_id: number; kind: string; home_goals: number; away_goals: number; scoring_api_id: number | null; created_at: string; sent_at: string | null }

const mocks = vi.hoisted(() => ({
  queue: [] as unknown[],
  claims: 0,
  sent: [] as string[],
  onClaim: null as null | (() => void),
}))

vi.mock('server-only', () => ({}))
vi.mock('./send', () => ({
  pushConfigured: () => true,
  sendPush: async (_to: string[], p: { title: string }) => {
    await new Promise((r) => setTimeout(r, p.title.endsWith(':slow') ? 5 : 0))
    mocks.sent.push(p.title.replace(':slow', ''))
    return 1
  },
}))
vi.mock('./describe', () => ({
  describeAlerts: async (_admin: unknown, alerts: Row[]) =>
    new Map(alerts.map((a) => [a.id, { push: { title: `a${a.id}${a.id === 1 ? ':slow' : ''}`, body: '', url: '' }, homeApiId: 1, awayApiId: 2, bar: null }])),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: { p_limit?: number }) => {
      if (fn === 'alert_recipients') return { data: ['u1'], error: null }
      mocks.claims += 1
      mocks.onClaim?.()
      return { data: mocks.queue.splice(0, args.p_limit ?? 5), error: null }
    },
  }),
}))

const NOW = Date.parse('2026-10-13T12:00:00Z')
const row = (id: number, fixture_id: number): Row => ({
  id, fixture_id, kind: 'goal', home_goals: 1, away_goals: 0, scoring_api_id: null, created_at: new Date(NOW - 60_000).toISOString(), sent_at: null,
})

beforeEach(() => {
  mocks.queue = []
  mocks.claims = 0
  mocks.sent = []
  mocks.onClaim = null
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('dispatchAlerts', () => {
  it('claims in small rounds until the queue is empty', async () => {
    mocks.queue = Array.from({ length: 12 }, (_, i) => row(i + 1, 100 + (i % 3)))
    const r = await dispatchAlerts({ now: () => NOW })
    expect(r).toEqual({ sent: 12, skipped: 0, more: false })
    expect(mocks.claims).toBe(3) // 5 + 5 + 2
  })

  it('stops claiming when time runs low; the rest stays queued (more: true)', async () => {
    mocks.queue = Array.from({ length: 12 }, (_, i) => row(i + 1, 100))
    let t = NOW
    mocks.onClaim = () => {
      t += 45_000 // a round that takes 45 s leaves less than the 20 s safety margin of a 60 s budget
    }
    const r = await dispatchAlerts({ now: () => t, budgetMs: 60_000 })
    expect(r).toEqual({ sent: 5, skipped: 0, more: true })
    expect(mocks.queue).toHaveLength(7) // never claimed, so nothing is lost
  })

  it('matches go out in parallel, each match in id order', async () => {
    mocks.queue = [row(1, 100), row(2, 200), row(3, 100)]
    await dispatchAlerts({ now: () => NOW })
    // a1 is slow: the other match does not wait for it, but a3 (same match) does
    expect(mocks.sent.indexOf('a2')).toBeLessThan(mocks.sent.indexOf('a1'))
    expect(mocks.sent.indexOf('a1')).toBeLessThan(mocks.sent.indexOf('a3'))
  })
})
