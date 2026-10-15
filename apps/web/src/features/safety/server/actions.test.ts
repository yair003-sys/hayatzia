// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REPORT = 'bbbbbbbb-0000-4000-8000-000000000001'
const RIDER = 'cccccccc-0000-4000-8000-000000000001'

const s = vi.hoisted(() => ({
  inserts: [] as { table: string; row: unknown }[],
  error: null as null | { message: string },
  /** What report_ride_harm() answers (the fan's session). */
  harm: { suspended: true, error: null as null | { message: string } },
  harmCalls: [] as unknown[],
  admins: ['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002'] as string[],
  riders: [] as string[],
  rpc: [] as { fn: string; args?: unknown }[],
  pushes: [] as { to: readonly string[]; payload: unknown }[],
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      insert: async (row: unknown) => {
        s.inserts.push({ table, row })
        return { error: s.error }
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      s.harmCalls.push({ fn, args })
      return s.harm.error
        ? { data: null, error: s.harm.error }
        : { data: [{ report_id: 'bbbbbbbb-0000-4000-8000-000000000001', suspended: s.harm.suspended }], error: null }
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args?: unknown) => {
      s.rpc.push(args === undefined ? { fn } : { fn, args })
      return { data: fn === 'admin_user_ids' ? s.admins : s.riders, error: null }
    },
  }),
}))
vi.mock('@/features/push/server/send', () => ({
  sendPush: async (to: readonly string[], payload: unknown) => {
    s.pushes.push({ to, payload })
    return to.length
  },
}))

import { contactAction, reportAction } from './actions'

beforeEach(() => {
  s.inserts = []
  s.error = null
  s.harm = { suspended: true, error: null }
  s.harmCalls = []
  s.riders = []
  s.rpc = []
  s.pushes = []
})

describe('contactAction ("צור קשר")', () => {
  it('files a contact request: topic as the reason, the text as the note, no target', async () => {
    const r = await contactAction({ topic: 'נגישות', text: '  הכפתור קטן מדי  ' })
    expect(r.data).toEqual({ ok: true })
    expect(s.inserts).toEqual([{ table: 'reports', row: { kind: 'contact', ref: '', reason: 'נגישות', note: 'הכפתור קטן מדי' } }])
  })

  it('says when the daily limit is reached', async () => {
    s.error = { message: 'rate_limit' }
    const r = await contactAction({ topic: 'אחר', text: 'שאלה' })
    expect(r.data).toEqual({ error: 'שלחת הרבה פניות היום. נסה שוב מחר' })
  })
})

describe('reportAction', () => {
  it('reports a market item by its own id', async () => {
    await reportAction({ kind: 'market_item', ref: 'item-1', reason: 'פריט מזויף / מכירת כרטיסים', note: '' })
    expect(s.inserts[0]?.row).toMatchObject({ kind: 'market_item', ref: 'item-1' })
  })
})

describe('reportAction: harm during a ride (ride safety, rule 9)', () => {
  const harm = { kind: 'trip' as const, ref: 'trip-1', reason: 'הטרדה או פגיעה בנסיעה' as const, note: 'פרטים' }

  it('files through report_ride_harm and, when it suspended, tells every admin so (no personal details)', async () => {
    const r = await reportAction(harm)
    expect(r.data).toEqual({ ok: true })
    expect(s.inserts).toEqual([])
    expect(s.harmCalls).toEqual([{ fn: 'report_ride_harm', args: { p_kind: 'trip', p_ref: 'trip-1', p_note: 'פרטים' } }])
    expect(s.pushes[0]).toEqual({
      to: s.admins,
      payload: {
        title: 'דיווח דחוף על נסיעה',
        body: 'התקבל דיווח על הטרדה או פגיעה בנסיעה. האוהד הושעה מנסיעות עד לבדיקה',
        url: '/admin/reports',
        tag: 'ride-harm',
      },
    })
  })

  it('without a suspension, the admins get "for review" and no rider is told anything', async () => {
    s.harm.suspended = false
    s.riders = [RIDER]
    await reportAction({ ...harm, kind: 'user', ref: 'user-1' })
    expect(s.pushes).toEqual([
      { to: s.admins, payload: { title: 'דיווח דחוף על נסיעה', body: 'דיווח דחוף על נסיעה לבדיקה', url: '/admin/reports', tag: 'ride-harm' } },
    ])
    expect(s.rpc).toEqual([{ fn: 'admin_user_ids' }])
  })

  it("tells the suspended driver's accepted riders that the ride is off for now", async () => {
    s.riders = [RIDER]
    await reportAction(harm)
    expect(s.rpc).toEqual([{ fn: 'admin_user_ids' }, { fn: 'ride_suspension_riders', args: { p_report: REPORT } }])
    expect(s.pushes[1]).toEqual({
      to: [RIDER],
      payload: { title: 'הנסיעה בוטלה זמנית', body: 'הנהג לא זמין כרגע לנסיעות. כדאי למצוא נסיעה אחרת למשחק', url: '/stand/trips', tag: 'ride-off' },
    })
  })

  it('an ordinary report, or a report that failed, notifies nobody', async () => {
    await reportAction({ kind: 'trip', ref: 'trip-1', reason: 'ספאם', note: '' })
    expect(s.harmCalls).toEqual([])
    s.harm.error = { message: 'rate_limit' }
    expect((await reportAction(harm)).data).toEqual({ error: 'שלחת הרבה דיווחים היום. תודה!' })
    expect(s.pushes).toEqual([])
  })
})
