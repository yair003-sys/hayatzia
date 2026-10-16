import { describe, expect, it } from 'vitest'
import { departureLabel, itemSchema, rateRideSchema, rideConsentSchema, tripSchema } from './schema'

describe('team life', () => {
  it('computes the departure time before kick-off (Israel time)', () => {
    // 2026-10-17 19:00 UTC = 22:00 Israel; 2h before = 20:00
    expect(departureLabel(Date.parse('2026-10-17T19:00:00Z') / 1000, 120)).toBe('20:00')
  })
  it('refuses tickets in the market', () => {
    expect(itemSchema.safeParse({ category: 'other', title: 'כרטיס למשחק', condition: 'new', price: 50 }).success).toBe(false)
    expect(itemSchema.safeParse({ category: 'scarf', title: 'צעיף', condition: 'used', price: 40 }).success).toBe(true)
  })
  it('validates a trip', () => {
    const ok = { fixtureId: 1, kind: 'offer', fromCity: 'חיפה', pickup: 'תחנת רכבת', departBeforeMin: 120, seats: 3, cost: 'share' }
    expect(tripSchema.safeParse(ok).success).toBe(true)
    expect(tripSchema.parse(ok).womenOnly).toBe(false)
    expect(tripSchema.safeParse({ ...ok, seats: 20 }).success).toBe(false)
  })
  it('requires a public pickup point (3+ characters)', () => {
    const ok = { fixtureId: 1, kind: 'offer', fromCity: 'חיפה', departBeforeMin: 120, seats: 3, cost: 'share' }
    expect(tripSchema.safeParse(ok).success).toBe(false)
    expect(tripSchema.safeParse({ ...ok, pickup: ' א ' }).success).toBe(false)
    expect(tripSchema.safeParse({ ...ok, pickup: 'צומת מרכזי' }).success).toBe(true)
  })
  it('rates 1 to 5 only', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    expect(rateRideSchema.safeParse({ tripId: id, stars: 5 }).success).toBe(true)
    expect(rateRideSchema.safeParse({ tripId: id, stars: 0 }).success).toBe(false)
    expect(rideConsentSchema.safeParse({ adult: false }).success).toBe(false)
  })
})
