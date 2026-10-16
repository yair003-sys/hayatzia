// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TRIP = '44444444-4444-4444-8444-444444444444'
const INCIDENT = '55555555-5555-4555-8555-555555555555'

const db = vi.hoisted(() => ({
  emergency: { data: null as unknown, error: null as null | { code: string; message: string } },
  admins: ['a1', 'a2'] as string[],
  calls: [] as { fn: string; args: unknown }[],
  pushes: [] as { to: string[]; payload: unknown }[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      db.calls.push({ fn, args })
      return db.emergency
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string) => {
      db.calls.push({ fn, args: null })
      return { data: db.admins, error: null }
    },
  }),
}))
vi.mock('@/features/matches/server/queries', () => ({ getLeague: async () => null }))
vi.mock('@/features/push/server/send', () => ({
  sendPush: async (to: string[], payload: unknown) => {
    db.pushes.push({ to, payload })
    return 1
  },
}))

import { reportEmergencyAction } from './emergency'

beforeEach(() => {
  db.emergency = { data: [{ incident_id: INCIDENT, created: true, from_city: 'רעננה', fixture_id: 94 }], error: null }
  db.admins = ['a1', 'a2']
  db.calls = []
  db.pushes = []
})

describe('reportEmergencyAction', () => {
  it('records the incident and pushes every admin once, with the route only', async () => {
    const r = await reportEmergencyAction({ tripId: TRIP })
    expect(r.data).toEqual({ ok: true, created: true })
    expect(db.calls[0]).toEqual({ fn: 'report_ride_emergency', args: { p_trip: TRIP } })
    expect(db.pushes).toEqual([
      {
        to: ['a1', 'a2'],
        payload: { title: 'חירום בנסיעה', body: 'רעננה → משחק', url: '/admin/reports', tag: `ride-emergency:${INCIDENT}` },
      },
    ])
  })

  it('a second tap within 10 minutes does not push again', async () => {
    db.emergency = { data: [{ incident_id: INCIDENT, created: false, from_city: 'רעננה', fixture_id: 94 }], error: null }
    const r = await reportEmergencyAction({ tripId: TRIP })
    expect(r.data).toEqual({ ok: true, created: false })
    expect(db.pushes).toEqual([])
  })

  it("a refusal comes back in the fan's words, and nobody is pushed", async () => {
    db.emergency = { data: null, error: { code: '42501', message: 'not_in_ride' } }
    const r = await reportEmergencyAction({ tripId: TRIP })
    expect(r.data).toEqual({ error: 'רק הנהג והנוסעים שאושרו יכולים לדווח על חירום בנסיעה' })
    expect(db.pushes).toEqual([])
  })

  it('an unknown failure still points to 100', async () => {
    db.emergency = { data: null, error: { code: 'XX000', message: 'boom' } }
    expect((await reportEmergencyAction({ tripId: TRIP })).data).toEqual({ error: 'לא הצלחנו להודיע לצוות. בחירום חייגו 100' })
  })
})
