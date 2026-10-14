// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { DEMO_PREFIX, describeAlerts, type Admin } from './describe'

vi.mock('server-only', () => ({}))

/** A read-only fake of the admin client: every query on a table resolves to that table's rows (or an error). */
function fakeAdmin(tables: Record<string, unknown[]>, failing: string[] = []) {
  return {
    from(table: string) {
      const result = failing.includes(table) ? { data: null, error: { code: 'XX000' } } : { data: tables[table] ?? [], error: null }
      const q = {
        select: () => q,
        in: () => q,
        eq: () => q,
        order: () => q,
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko),
      }
      return q
    },
  } as unknown as Admin
}

const goal = { id: 9, fixture_id: 77, kind: 'goal', home_goals: 1, away_goals: 0, scoring_api_id: 604 }
const tables = (isDemo: boolean) => ({
  fixtures: [{ id: 77, home_api_id: 604, away_api_id: 4486, is_demo: isDemo }],
  fixture_details: [{ fixture_id: 77, events: [{ m: 12, x: 0, team: 604, p: 'E. Zahavi', as: '', type: 'Goal', det: 'Normal Goal' }] }],
  match_alerts: [{ id: 9, fixture_id: 77, home_goals: 1, away_goals: 0 }],
  api_teams: [{ api_id: 604, name: 'Maccabi Tel Aviv' }, { api_id: 4486, name: 'Hapoel Tel Aviv' }],
})

describe('describeAlerts', () => {
  it('builds the push text with the scorer, the clubs and the scoring club colour', async () => {
    const d = (await describeAlerts(fakeAdmin(tables(false)), [goal])).get(9)
    expect(d?.push.title).toBe('⚽ שער! מכבי תל אביב 1:0 הפועל תל אביב')
    expect(d?.push.body).toBe('12′ · E. Zahavi')
    expect(d).toMatchObject({ homeApiId: 604, awayApiId: 4486, bar: '#FFD400' })
  })

  it('a demo match is labelled "לדוגמה" in the title (push and banner)', async () => {
    const d = (await describeAlerts(fakeAdmin(tables(true)), [goal])).get(9)
    expect(d?.push.title).toBe(`${DEMO_PREFIX}⚽ שער! מכבי תל אביב 1:0 הפועל תל אביב`)
    const ft = (await describeAlerts(fakeAdmin(tables(true)), [{ ...goal, id: 10, kind: 'ft', scoring_api_id: null }])).get(10)
    expect(ft?.push.title).toBe(`${DEMO_PREFIX}סיום: מכבי תל אביב 1:0 הפועל תל אביב`)
    expect(ft?.bar).toBeNull()
  })

  it('strict: a read error throws; lenient: it builds what it can', async () => {
    await expect(describeAlerts(fakeAdmin(tables(false), ['fixture_details']), [goal], { strict: true })).rejects.toThrow('read failed')
    const d = (await describeAlerts(fakeAdmin(tables(false), ['fixture_details']), [goal])).get(9)
    expect(d?.push.body).toBe('')
  })
})
