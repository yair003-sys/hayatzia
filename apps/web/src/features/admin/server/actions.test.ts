// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const FAN = '22222222-2222-4222-8222-222222222222'
const CLIP = '33333333-3333-4333-8333-333333333333'

type RpcResult = { data: unknown; error: null | { message: string } }

const s = vi.hoisted(() => ({
  rpcCalls: [] as { fn: string; args: unknown }[],
  rpc: (() => ({ data: null, error: null })) as (fn: string, args: unknown) => RpcResult,
  adminKey: true,
  removed: [] as { bucket: string; paths: string[] }[],
  removeError: null as null | { message: string },
  revalidated: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => s.revalidated.push(p) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      s.rpcCalls.push({ fn, args })
      return s.rpc(fn, args)
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () =>
    s.adminKey
      ? {
          storage: {
            from: (bucket: string) => ({
              remove: async (paths: string[]) => {
                s.removed.push({ bucket, paths })
                return { data: [], error: s.removeError }
              },
            }),
          },
        }
      : null,
}))

import { banUserAction, removeContentAction, restoreContentAction, setReportStatusAction, unbanUserAction } from './actions'

const notAdmin: RpcResult = { data: null, error: { message: 'not_admin' } }

beforeEach(() => {
  s.rpcCalls = []
  s.rpc = () => ({ data: null, error: null })
  s.adminKey = true
  s.removed = []
  s.removeError = null
  s.revalidated = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a fan who is not an admin', () => {
  it('is refused by every action, and no file is ever touched', async () => {
    s.rpc = () => notAdmin
    const results = await Promise.all([
      removeContentAction({ kind: 'clip', ref: CLIP }),
      banUserAction({ userId: FAN, days: 7, reason: '' }),
      unbanUserAction({ userId: FAN }),
      setReportStatusAction({ reportId: CLIP, status: 'dismissed' }),
      restoreContentAction({ kind: 'clip', ref: CLIP }),
    ])
    for (const r of results) expect(r.data).toEqual({ error: 'אין לך הרשאה לפעולה הזאת' })
    expect(s.removed).toEqual([])
    expect(s.revalidated).toEqual([])
  })
})

describe('removeContentAction', () => {
  it('removes the post through the database, then deletes its file with the service key', async () => {
    s.rpc = () => ({ data: [{ removed: true, bucket: 'clips', path: `${FAN}/a.mp4` }], error: null })
    const r = await removeContentAction({ kind: 'clip', ref: CLIP })
    expect(s.rpcCalls).toEqual([{ fn: 'admin_remove_content', args: { p_kind: 'clip', p_ref: CLIP } }])
    expect(s.removed).toEqual([{ bucket: 'clips', paths: [`${FAN}/a.mp4`] }])
    expect(r.data).toEqual({ ok: true, removed: true, fileLeft: false })
    expect(s.revalidated).toEqual(['/admin/reports'])
  })

  it('touches no file for content without one', async () => {
    s.rpc = () => ({ data: [{ removed: true, bucket: null, path: null }], error: null })
    const r = await removeContentAction({ kind: 'team_message', ref: CLIP })
    expect(s.removed).toEqual([])
    expect(r.data).toEqual({ ok: true, removed: true, fileLeft: false })
  })

  it('never deletes from a bucket outside the content buckets', async () => {
    s.rpc = () => ({ data: [{ removed: true, bucket: 'avatars', path: `${FAN}/me.jpg` }], error: null })
    await removeContentAction({ kind: 'clip', ref: CLIP })
    expect(s.removed).toEqual([])
  })

  it('says so when the file could not be deleted (the row is gone already)', async () => {
    s.rpc = () => ({ data: [{ removed: true, bucket: 'clips', path: `${FAN}/a.mp4` }], error: null })
    s.removeError = { message: 'boom' }
    const r = await removeContentAction({ kind: 'clip', ref: CLIP })
    expect(r.data).toEqual({ ok: true, removed: true, fileLeft: true })
  })

  it('refuses kinds that are not content before calling the database', async () => {
    const r = await removeContentAction({ kind: 'user', ref: FAN } as never)
    expect(r.validationErrors).toBeDefined()
    expect(s.rpcCalls).toEqual([])
  })
})

describe('restoreContentAction', () => {
  it('puts hidden content back through the database and refreshes the queue', async () => {
    s.rpc = () => ({ data: true, error: null })
    const r = await restoreContentAction({ kind: 'clip', ref: CLIP })
    expect(s.rpcCalls).toEqual([{ fn: 'admin_restore_content', args: { p_kind: 'clip', p_ref: CLIP } }])
    expect(r.data).toEqual({ ok: true, restored: true })
    expect(s.revalidated).toEqual(['/admin/reports'])
    expect(s.removed).toEqual([])
  })

  it('says when the content was not hidden', async () => {
    s.rpc = () => ({ data: false, error: null })
    const r = await restoreContentAction({ kind: 'review', ref: `mta_1:${FAN}` })
    expect(r.data).toEqual({ ok: true, restored: false })
  })

  it('refuses kinds that are not content before calling the database', async () => {
    const r = await restoreContentAction({ kind: 'user', ref: FAN } as never)
    expect(r.validationErrors).toBeDefined()
    expect(s.rpcCalls).toEqual([])
  })
})

describe('banUserAction', () => {
  it('suspends for 7 days, or for good (no days: the function\'s default)', async () => {
    s.rpc = () => ({ data: null, error: null })
    await banUserAction({ userId: FAN, days: 7, reason: 'הטרדה' })
    await banUserAction({ userId: FAN, days: null, reason: '' })
    expect(s.rpcCalls).toEqual([
      { fn: 'admin_ban_user', args: { p_user: FAN, p_reason: 'הטרדה', p_days: 7 } },
      { fn: 'admin_ban_user', args: { p_user: FAN, p_reason: '' } },
    ])
  })

  it('explains that an admin cannot be suspended', async () => {
    s.rpc = () => ({ data: null, error: { message: 'cannot_ban_admin' } })
    const r = await banUserAction({ userId: FAN, days: 7, reason: '' })
    expect(r.data).toEqual({ error: 'אי אפשר להשעות מנהל' })
  })
})
