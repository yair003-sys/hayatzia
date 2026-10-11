import { describe, expect, it } from 'vitest'
import { departureLabel, itemSchema, tripSchema } from './schema'

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
    const ok = { fixtureId: 1, kind: 'offer', fromCity: 'חיפה', departBeforeMin: 120, seats: 3, cost: 'share' }
    expect(tripSchema.safeParse(ok).success).toBe(true)
    expect(tripSchema.safeParse({ ...ok, seats: 20 }).success).toBe(false)
  })
})
