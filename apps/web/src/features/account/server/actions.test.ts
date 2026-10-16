// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

type Entry = { name: string; id: string | null }

const s = vi.hoisted(() => ({
  me: '' as string | null,
  /** What my_ban_active() answers: true / false, or a database error. */
  banned: false as boolean | 'error',
  /** What my_ride_case_open() answers (ride safety, rule 11). */
  rideCase: false as boolean | 'error',
  rpcs: [] as string[],
  admin: true,
  /** Objects per bucket, keyed by full path. */
  files: {} as Record<string, string[]>,
  listed: [] as { bucket: string; prefix: string }[],
  removed: [] as { bucket: string; paths: string[] }[],
  deleted: [] as string[],
  deleteError: null as null | { code?: string; status?: number; message: string },
  listError: false,
  signOuts: [] as unknown[],
  redirects: [] as string[],
}))

/** Lists one level under `prefix` like Supabase Storage: files with an id, sub-folders without one. */
function listLevel(bucket: string, prefix: string): Entry[] {
  const seen = new Map<string, Entry>()
  for (const p of s.files[bucket] ?? []) {
    if (!p.startsWith(`${prefix}/`)) continue
    const rest = p.slice(prefix.length + 1)
    const [head, ...tail] = rest.split('/')
    if (!head) continue
    seen.set(head, { name: head, id: tail.length ? null : `id-${p}` })
  }
  return [...seen.values()]
}

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    s.redirects.push(url)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (fn: string) => {
      s.rpcs.push(fn)
      const v = fn === 'my_ride_case_open' ? s.rideCase : s.banned
      return v === 'error' ? { data: null, error: { message: 'boom' } } : { data: v, error: null }
    },
    auth: {
      getClaims: async () => ({ data: s.me ? { claims: { sub: s.me } } : null }),
      signOut: async (opts: unknown) => {
        s.signOuts.push(opts)
        return { error: null }
      },
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () =>
    s.admin
      ? {
          storage: {
            from: (bucket: string) => ({
              list: async (prefix: string) => {
                s.listed.push({ bucket, prefix })
                if (s.listError) return { data: null, error: { message: 'boom' } }
                return { data: listLevel(bucket, prefix), error: null }
              },
              remove: async (paths: string[]) => {
                s.removed.push({ bucket, paths })
                s.files[bucket] = (s.files[bucket] ?? []).filter((p) => !paths.includes(p))
                return { data: [], error: null }
              },
            }),
          },
          auth: {
            admin: {
              deleteUser: async (id: string) => {
                s.deleted.push(id)
                return { data: {}, error: s.deleteError }
              },
            },
          },
        }
      : null,
}))

import { deleteAccountAction } from './actions'

beforeEach(() => {
  s.me = ME
  s.banned = false
  s.rideCase = false
  s.rpcs = []
  s.admin = true
  s.files = {}
  s.listed = []
  s.removed = []
  s.deleted = []
  s.deleteError = null
  s.listError = false
  s.signOuts = []
  s.redirects = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('deleteAccountAction', () => {
  it('deletes the session user, removes their files in every bucket, signs out and goes to the welcome page', async () => {
    s.files = {
      clips: [`${ME}/a.mp4`, `${ME}/b.jpg`, `${OTHER}/keep.mp4`],
      stand: [`${ME}/p.webp`],
      market: [`${ME}/shirt.jpg`, `${ME}/old/nested.jpg`],
      chants: [`${OTHER}/song.mp3`],
    }
    await deleteAccountAction({ confirm: 'מחק' })

    expect(s.deleted).toEqual([ME])
    expect(s.files.clips).toEqual([`${OTHER}/keep.mp4`])
    expect(s.files.stand).toEqual([])
    expect(s.files.market).toEqual([])
    expect(s.files.chants).toEqual([`${OTHER}/song.mp3`])
    // Only the fan's own folder is ever listed.
    expect(new Set(s.listed.map((l) => l.bucket))).toEqual(new Set(['clips', 'stand', 'market', 'chants']))
    for (const l of s.listed) expect(l.prefix.startsWith(ME)).toBe(true)
    for (const r of s.removed) for (const p of r.paths) expect(p.startsWith(`${ME}/`)).toBe(true)
    expect(s.signOuts).toEqual([{ scope: 'local' }])
    expect(s.redirects).toEqual(['/?deleted=1'])
  })

  it('takes the user id from the session only: any id in the input is refused', async () => {
    const r = await deleteAccountAction({ confirm: 'מחק', userId: OTHER } as never)
    expect(r.validationErrors).toBeDefined()
    expect(s.deleted).toEqual([])
    expect(s.removed).toEqual([])
  })

  it('refuses without a session', async () => {
    s.me = null
    const r = await deleteAccountAction({ confirm: 'מחק' })
    expect(r.data).toEqual({ error: 'צריך להתחבר מחדש כדי למחוק את החשבון' })
    expect(s.deleted).toEqual([])
    expect(s.listed).toEqual([])
  })

  it('refuses without the confirmation word', async () => {
    const r = await deleteAccountAction({ confirm: 'כן' })
    expect(r.validationErrors?.confirm?._errors?.[0]).toContain('מחק')
    expect(s.deleted).toEqual([])
  })

  it('accepts the word with spaces around it', async () => {
    await deleteAccountAction({ confirm: '  מחק ' })
    expect(s.deleted).toEqual([ME])
  })

  it('stops before deleting the user when the files cannot be removed', async () => {
    s.listError = true
    const r = await deleteAccountAction({ confirm: 'מחק' })
    expect(r.data).toEqual({ error: 'המחיקה נכשלה. נסה שוב' })
    expect(s.deleted).toEqual([])
    expect(s.redirects).toEqual([])
  })

  it('reports a failed delete without signing out, and logs the code only', async () => {
    s.deleteError = { code: 'unexpected_failure', status: 500, message: 'secret-looking details' }
    const r = await deleteAccountAction({ confirm: 'מחק' })
    expect(r.data).toEqual({ error: 'המחיקה נכשלה, וחלק מהתמונות והסרטונים כבר נמחקו. נסה שוב' })
    expect(s.signOuts).toEqual([])
    expect(s.redirects).toEqual([])
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-looking')
  })

  it('refuses while the fan is suspended, before touching any file (no leaving and coming back clean)', async () => {
    s.banned = true
    s.files = { clips: [`${ME}/a.mp4`] }
    const r = await deleteAccountAction({ confirm: 'מחק' })
    expect(r.data).toEqual({ error: 'אי אפשר למחוק חשבון בזמן השעיה' })
    expect(s.rpcs).toEqual(['my_ban_active'])
    expect(s.listed).toEqual([])
    expect(s.deleted).toEqual([])
    expect(s.files.clips).toEqual([`${ME}/a.mp4`])
  })

  it('refuses during an open ride case (suspension from rides or an open harm report), before touching any file', async () => {
    s.files = { clips: [`${ME}/a.mp4`] }
    s.rideCase = true
    const r = await deleteAccountAction({ confirm: 'מחק' })
    expect(r.data).toEqual({ error: 'אי אפשר למחוק חשבון בזמן בירור' })
    expect(s.rpcs).toEqual(['my_ban_active', 'my_ride_case_open'])
    expect(s.listed).toEqual([])
    expect(s.deleted).toEqual([])
  })

  it('refuses when the ride case check itself fails', async () => {
    s.rideCase = 'error'
    const r = await deleteAccountAction({ confirm: 'מחק' })
    expect(r.data).toEqual({ error: 'המחיקה נכשלה. נסה שוב' })
    expect(s.deleted).toEqual([])
  })

  it('refuses when the suspension check itself fails', async () => {
    s.banned = 'error'
    const r = await deleteAccountAction({ confirm: 'מחק' })
    expect(r.data).toEqual({ error: 'המחיקה נכשלה. נסה שוב' })
    expect(s.deleted).toEqual([])
    expect(s.listed).toEqual([])
  })

  it('is unavailable without the admin key', async () => {
    s.admin = false
    const r = await deleteAccountAction({ confirm: 'מחק' })
    expect(r.data).toEqual({ error: 'מחיקת החשבון לא זמינה כרגע. נסה שוב מאוחר יותר' })
  })
})
