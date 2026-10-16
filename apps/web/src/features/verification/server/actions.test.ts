// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ME = '11111111-1111-4111-8111-111111111111'

const db = vi.hoisted(() => ({
  claim: { data: null as unknown, error: null as null | { code: string; message: string } },
  rpc: [] as string[],
  admin: [] as { fn: string; args: unknown }[],
  lookup: vi.fn(async (plate: string) => ({ plate, make: 'מאזדה', model: '3', colour: 'לבן', year: 2019 }) as unknown),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_ENV: 'local' } }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: ME } } }) },
    rpc: async (fn: string) => {
      db.rpc.push(fn)
      return fn === 'claim_registry_lookup' ? db.claim : { data: null, error: null }
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      db.admin.push({ fn, args })
      return { data: null, error: null }
    },
  }),
}))
vi.mock('./vehicle-registry', () => ({
  lookupVehicle: db.lookup,
  RegistryError: class extends Error {},
}))

import { registerCarAction } from './actions'

beforeEach(() => {
  db.claim = { data: null, error: null }
  db.rpc = []
  db.admin = []
  db.lookup.mockClear()
})

describe('registerCarAction', () => {
  it('claims one of the day\'s registry lookups before fetching, then stores the registry\'s car', async () => {
    const r = await registerCarAction({ plate: '12-345-67' })
    expect(r.data).toEqual({ ok: true })
    expect(db.rpc).toEqual(['claim_registry_lookup'])
    expect(db.lookup).toHaveBeenCalledWith('1234567')
    expect(db.admin).toEqual([
      { fn: 'set_fan_car', args: { p_user: ME, p_plate: '1234567', p_make: 'מאזדה', p_model: '3', p_colour: 'לבן', p_year: 2019 } },
    ])
  })

  it('over the daily limit: no fetch at all', async () => {
    db.claim = { data: null, error: { code: 'P0001', message: 'rate_limit' } }
    const r = await registerCarAction({ plate: '1234567' })
    expect(r.data).toEqual({ error: 'בדקת הרבה מספרי רכב היום. נסה שוב מחר' })
    expect(db.lookup).not.toHaveBeenCalled()
    expect(db.admin).toEqual([])
  })

  it('a bad plate is refused before anything', async () => {
    expect((await registerCarAction({ plate: '0123456' })).data).toEqual({ error: 'מספר רכב הוא 7 או 8 ספרות' })
    expect(db.rpc).toEqual([])
  })
})
