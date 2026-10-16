// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ME = '11111111-1111-4111-8111-111111111111'
const OWNER = '22222222-2222-4222-8222-222222222222'
const RIDER = '33333333-3333-4333-8333-333333333333'
const TRIP = '44444444-4444-4444-8444-444444444444'

type Filter = [op: string, column: string, value: unknown]

const db = vi.hoisted(() => ({
  me: '' as string | null,
  tripOwner: '' as string | null,
  nick: 'דני' as string | null,
  blocked: false,
  insertError: null as null | { code: string; message: string },
  /** Rows the status update changed (RLS: none for a non-driver; none when the answer is the same). */
  updated: [] as { user_id: string }[],
  updateFilters: [] as Filter[],
  rpc: [] as { fn: string; args: unknown }[],
  pushes: [] as { to: string[]; payload: unknown }[],
  inserted: [] as { table: string; row: unknown }[],
  tripInsertError: null as null | { code: string; message: string },
}))

class Query {
  private op: 'select' | 'insert' | 'update' = 'select'
  private filters: Filter[] = []
  constructor(private table: string) {}
  select() {
    return this
  }
  insert(row: unknown) {
    this.op = 'insert'
    db.inserted.push({ table: this.table, row })
    return this
  }
  update() {
    this.op = 'update'
    return this
  }
  eq(c: string, v: unknown) {
    this.filters.push(['eq', c, v])
    return this
  }
  neq(c: string, v: unknown) {
    this.filters.push(['neq', c, v])
    return this
  }
  maybeSingle() {
    return Promise.resolve(this.result())
  }
  then<R>(onOk: (v: unknown) => R, onErr?: (e: unknown) => R) {
    return Promise.resolve(this.result()).then(onOk, onErr)
  }
  private result() {
    if (this.table === 'trips' && this.op === 'insert') return { data: null, error: db.tripInsertError }
    if (this.table === 'trips') return { data: db.tripOwner ? { user_id: db.tripOwner } : null, error: null }
    if (this.table === 'profiles') return { data: db.nick ? { nick: db.nick } : null, error: null }
    if (this.table === 'trip_requests' && this.op === 'insert') return { data: null, error: db.insertError }
    if (this.table === 'trip_requests' && this.op === 'update') {
      db.updateFilters = this.filters
      return { data: db.updated, error: null }
    }
    return { data: null, error: null }
  }
}

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => new Query(t),
    rpc: async (fn: string, args: unknown) => {
      db.rpc.push({ fn, args })
      return { data: db.blocked, error: null }
    },
    auth: { getClaims: async () => ({ data: db.me ? { claims: { sub: db.me } } : null }) },
  }),
}))
vi.mock('@/features/push/server/send', () => ({
  sendPush: async (to: string[], payload: unknown) => {
    db.pushes.push({ to, payload })
    return 1
  },
}))

import { createTripAction, decideSeatAction, requestSeatAction } from './actions'

beforeEach(() => {
  db.me = ME
  db.tripOwner = OWNER
  db.nick = 'דני'
  db.blocked = false
  db.insertError = null
  db.updated = []
  db.updateFilters = []
  db.rpc = []
  db.pushes = []
  db.inserted = []
  db.tripInsertError = null
})

describe('trip push: a request', () => {
  it("goes to the trip's driver only, with the spec's title, an empty body and the trip's link", async () => {
    const r = await requestSeatAction({ id: TRIP })
    expect(r.data).toEqual({ ok: true })
    expect(db.pushes).toEqual([
      { to: [OWNER], payload: { title: 'דני ביקש להצטרף לנסיעה שלך', body: '', url: `/stand/trips?trip=${TRIP}`, tag: `trip:${TRIP}` } },
    ])
    expect(db.rpc).toEqual([{ fn: 'blocked_between', args: { a: ME, b: OWNER } }])
  })

  it('never to myself (my own trip)', async () => {
    db.tripOwner = ME
    await requestSeatAction({ id: TRIP })
    expect(db.pushes).toEqual([])
  })

  it('not between fans blocked either way', async () => {
    db.blocked = true
    await requestSeatAction({ id: TRIP })
    expect(db.pushes).toEqual([])
  })

  it('a request already made (duplicate) or a failed one sends nothing', async () => {
    db.insertError = { code: '23505', message: 'duplicate' }
    expect((await requestSeatAction({ id: TRIP })).data).toEqual({ ok: true })
    db.insertError = { code: 'P0001', message: 'rate_limit' }
    expect((await requestSeatAction({ id: TRIP })).data).toEqual({ error: 'יותר מדי פרסומים בשעה האחרונה' })
    expect(db.pushes).toEqual([])
  })

  it('an unknown nick falls back to "אוהד"', async () => {
    db.nick = null
    await requestSeatAction({ id: TRIP })
    expect(db.pushes[0]?.payload).toMatchObject({ title: 'אוהד ביקש להצטרף לנסיעה שלך', body: '' })
  })
})

describe('trip push: an acceptance', () => {
  it('goes to the rider only, with the driver (me) named; the same answer twice changes nothing', async () => {
    db.updated = [{ user_id: RIDER }]
    const r = await decideSeatAction({ tripId: TRIP, userId: RIDER, accept: true })
    expect(r.data).toEqual({ ok: true })
    expect(db.updateFilters).toContainEqual(['neq', 'status', 'accepted'])
    expect(db.pushes).toEqual([
      { to: [RIDER], payload: { title: 'אושרת! הצטרפת לנסיעה של דני', body: '', url: `/stand/trips?trip=${TRIP}`, tag: `trip:${TRIP}` } },
    ])
  })

  it('a non-driver, or an answer already given, updates no row: nobody is told', async () => {
    db.updated = []
    await decideSeatAction({ tripId: TRIP, userId: RIDER, accept: true })
    await decideSeatAction({ tripId: TRIP, userId: RIDER, accept: false })
    expect(db.pushes).toEqual([])
  })

  it('a decline is not sent across a block either (security review 2026-10-15)', async () => {
    db.updated = [{ user_id: RIDER }]
    db.blocked = true
    await decideSeatAction({ tripId: TRIP, userId: RIDER, accept: false })
    expect(db.pushes).toEqual([])
    db.blocked = false
    await decideSeatAction({ tripId: TRIP, userId: RIDER, accept: false })
    expect(db.pushes.map((p) => p.to)).toEqual([[RIDER]])
  })

  it('not between fans blocked either way, and never to myself', async () => {
    db.updated = [{ user_id: RIDER }]
    db.blocked = true
    await decideSeatAction({ tripId: TRIP, userId: RIDER, accept: true })
    db.blocked = false
    db.updated = [{ user_id: ME }]
    await decideSeatAction({ tripId: TRIP, userId: ME, accept: true })
    expect(db.pushes).toEqual([])
  })
})

describe('ride safety (migration 20261015220000_ride_safety)', () => {
  const trip = { fixtureId: 7, kind: 'offer' as const, fromCity: 'חיפה', pickup: 'תחנת רכבת', departBeforeMin: 120, seats: 3, cost: 'share' as const }

  it('stores the public pickup point and the women-only flag', async () => {
    const r = await createTripAction({ ...trip, womenOnly: true })
    expect(r.data).toEqual({ ok: true })
    expect(db.inserted).toEqual([
      {
        table: 'trips',
        row: { fixture_id: 7, kind: 'offer', from_city: 'חיפה', depart_before_min: 120, seats: 3, cost: 'share', note: '', pickup: 'תחנת רכבת', women_only: true },
      },
    ])
  })

  it("puts the database's ride refusals in the fan's words", async () => {
    db.tripInsertError = { code: '42501', message: 'not_adult' }
    expect((await createTripAction(trip)).data).toEqual({ error: 'נסיעות הן מגיל 18. צריך לאשר את זה פעם אחת לפני נסיעה' })
    db.tripInsertError = { code: '42501', message: 'women_only' }
    expect((await createTripAction(trip)).data).toEqual({ error: 'הנסיעה הזאת לאוהדות בלבד' })
    db.insertError = { code: '42501', message: 'ride_suspended' }
    expect((await requestSeatAction({ id: TRIP })).data?.error).toMatch(/מושעה מנסיעות/)
    expect(db.pushes).toEqual([])
  })
})
