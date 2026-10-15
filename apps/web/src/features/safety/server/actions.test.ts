// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({
  inserts: [] as { table: string; row: unknown }[],
  error: null as null | { message: string },
  admins: ['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002'] as string[],
  rpc: [] as string[],
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
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string) => {
      s.rpc.push(fn)
      return { data: s.admins, error: null }
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
  it('notifies every admin at once, with no personal details', async () => {
    const r = await reportAction({ kind: 'trip', ref: 'trip-1', reason: 'הטרדה או פגיעה בנסיעה', note: 'פרטים' })
    expect(r.data).toEqual({ ok: true })
    expect(s.rpc).toEqual(['admin_user_ids'])
    expect(s.pushes).toEqual([
      {
        to: s.admins,
        payload: {
          title: 'דיווח דחוף על נסיעה',
          body: 'התקבל דיווח על הטרדה או פגיעה בנסיעה. האוהד הושעה מנסיעות עד לבדיקה',
          url: '/admin/reports',
          tag: 'ride-harm',
        },
      },
    ])
  })

  it('also for a report on a fan', async () => {
    await reportAction({ kind: 'user', ref: 'user-1', reason: 'הטרדה או פגיעה בנסיעה', note: '' })
    expect(s.pushes).toHaveLength(1)
  })

  it('an ordinary report, or a report that failed, notifies nobody', async () => {
    await reportAction({ kind: 'trip', ref: 'trip-1', reason: 'ספאם', note: '' })
    s.error = { message: 'rate_limit' }
    await reportAction({ kind: 'trip', ref: 'trip-1', reason: 'הטרדה או פגיעה בנסיעה', note: '' })
    expect(s.pushes).toEqual([])
  })
})
