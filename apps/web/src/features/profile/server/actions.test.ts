// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ME = '11111111-1111-4111-8111-111111111111'

const s = vi.hoisted(() => ({
  inserts: [] as unknown[],
  redirects: [] as string[],
  rpcs: [] as { fn: string; args: unknown }[],
  deletes: [] as { table: string; column: string; value: unknown }[],
  signedOut: 0,
  insertError: null as null | { code: string; message: string },
  rpcError: null as null | { message: string },
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    s.redirects.push(url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: ME } } }),
      signOut: async () => {
        s.signedOut += 1
      },
    },
    from: (table: string) => ({
      insert: async (row: unknown) => {
        s.inserts.push(row)
        return { error: s.insertError }
      },
      delete: () => ({
        eq: async (column: string, value: unknown) => {
          s.deletes.push({ table, column, value })
          return { error: null }
        },
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      s.rpcs.push({ fn, args })
      return { error: s.rpcError }
    },
  }),
}))

import { createProfileAction, setBirthDateAction, signOutAction } from './actions'

const BIRTH = '1990-05-01'

beforeEach(() => {
  s.inserts = []
  s.redirects = []
  s.rpcs = []
  s.deletes = []
  s.signedOut = 0
  s.insertError = null
  s.rpcError = null
})

describe('createProfileAction: consent (terms, privacy) and birth date', () => {
  it('creates no profile without the consent', async () => {
    const r = await createProfileAction({ teamId: 'mta', nick: 'יאיר', confirm: true, birthDate: BIRTH } as never)
    expect(r.validationErrors?.accept?._errors?.[0]).toBe('צריך לאשר את תנאי השימוש ומדיניות הפרטיות')
    expect(s.inserts).toEqual([])
    const r2 = await createProfileAction({ teamId: 'mta', nick: 'יאיר', confirm: true, accept: false, birthDate: BIRTH } as never)
    expect(r2.validationErrors?.accept).toBeDefined()
    expect(s.inserts).toEqual([])
  })

  it('creates no profile without a birth date, or under 16', async () => {
    const r = await createProfileAction({ teamId: 'mta', nick: 'יאיר', confirm: true, accept: true } as never)
    expect(r.validationErrors?.birthDate).toBeDefined()
    const r2 = await createProfileAction({ teamId: 'mta', nick: 'יאיר', confirm: true, accept: true, birthDate: '2020-01-01' })
    expect(r2.validationErrors?.birthDate?._errors?.[0]).toBe('ההרשמה מגיל 16')
    expect(s.inserts).toEqual([])
  })

  it('creates the profile with the birth date for the session user', async () => {
    await createProfileAction({ teamId: 'mta', nick: ' יאיר ', confirm: true, accept: true, birthDate: BIRTH })
    // The accepted terms version is recorded with the profile (the database refuses it without).
    expect(s.inserts).toEqual([{ user_id: ME, team_id: 'mta', nick: 'יאיר', terms_version: '2026-10-15', birth_date: BIRTH }])
    expect(s.redirects).toEqual(['/stand'])
  })

  it('goes back to a scanned QR card after sign-up, and nowhere outside the app', async () => {
    await createProfileAction({ teamId: 'mta', nick: 'יאיר', confirm: true, accept: true, birthDate: BIRTH, next: '/add/abcDEF123_-abcDEF123_-x' })
    await createProfileAction({ teamId: 'mta', nick: 'יאיר', confirm: true, accept: true, birthDate: BIRTH, next: 'https://evil.example' })
    expect(s.redirects).toEqual(['/add/abcDEF123_-abcDEF123_-x', '/stand'])
  })

  it('shows the database refusal of the birth date in Hebrew', async () => {
    s.insertError = { code: '22023', message: 'too_young' }
    const r = await createProfileAction({ teamId: 'mta', nick: 'יאיר', confirm: true, accept: true, birthDate: BIRTH })
    expect(r.data).toEqual({ error: 'ההרשמה מגיל 16' })
    expect(s.redirects).toEqual([])
  })
})

describe('setBirthDateAction: the one-time prompt for fans from before', () => {
  it('saves through set_birth_date', async () => {
    const r = await setBirthDateAction({ birthDate: BIRTH })
    expect(s.rpcs).toEqual([{ fn: 'set_birth_date', args: { p_date: BIRTH } }])
    expect(r.data).toEqual({ ok: true })
  })

  it('maps the refusals', async () => {
    s.rpcError = { message: 'already_set' }
    const r = await setBirthDateAction({ birthDate: BIRTH })
    expect(r.data).toEqual({ error: 'תאריך הלידה כבר נשמר' })
  })
})

describe('signOutAction: remove this device\'s push subscription (2026-10-17)', () => {
  it('deletes the subscription for the endpoint passed from the browser, then signs out', async () => {
    const fd = new FormData()
    fd.set('endpoint', 'https://fcm.googleapis.com/dev')
    await signOutAction(fd)
    expect(s.deletes).toEqual([{ table: 'push_subscriptions', column: 'endpoint', value: 'https://fcm.googleapis.com/dev' }])
    expect(s.signedOut).toBe(1)
    expect(s.redirects).toEqual(['/'])
  })

  it('still signs out when there is no endpoint (no push on this device)', async () => {
    await signOutAction()
    expect(s.deletes).toEqual([])
    expect(s.signedOut).toBe(1)
    expect(s.redirects).toEqual(['/'])
  })
})
