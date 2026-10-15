// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ME = '11111111-1111-4111-8111-111111111111'

const s = vi.hoisted(() => ({ inserts: [] as unknown[], redirects: [] as string[] }))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    s.redirects.push(url)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: ME } } }) },
    from: () => ({
      insert: async (row: unknown) => {
        s.inserts.push(row)
        return { error: null }
      },
    }),
  }),
}))

import { createProfileAction } from './actions'

beforeEach(() => {
  s.inserts = []
  s.redirects = []
})

describe('createProfileAction: consent (16+, terms, privacy)', () => {
  it('creates no profile without the consent', async () => {
    const r = await createProfileAction({ teamId: 'mta', nick: 'יאיר', confirm: true } as never)
    expect(r.validationErrors?.accept?._errors?.[0]).toBe('צריך לאשר את הגיל, תנאי השימוש ומדיניות הפרטיות')
    expect(s.inserts).toEqual([])
    const r2 = await createProfileAction({ teamId: 'mta', nick: 'יאיר', confirm: true, accept: false } as never)
    expect(r2.validationErrors?.accept).toBeDefined()
    expect(s.inserts).toEqual([])
  })

  it('creates the profile for the session user once the box is ticked', async () => {
    await createProfileAction({ teamId: 'mta', nick: ' יאיר ', confirm: true, accept: true })
    // The accepted terms version is recorded with the profile (the database refuses it without).
    expect(s.inserts).toEqual([{ user_id: ME, team_id: 'mta', nick: 'יאיר', terms_version: '2026-10-15' }])
    expect(s.redirects).toEqual(['/stand'])
  })
})
