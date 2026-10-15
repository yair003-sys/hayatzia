// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({
  inserts: [] as { table: string; row: unknown }[],
  error: null as null | { message: string },
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

import { contactAction, reportAction } from './actions'

beforeEach(() => {
  s.inserts = []
  s.error = null
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
