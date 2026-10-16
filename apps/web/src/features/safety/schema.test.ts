import { describe, expect, it } from 'vitest'
import { CONTACT_MAX, CONTACT_TOPICS, REPORT_KINDS, REPORT_REASONS, RIDE_HARM_REASON, contactSchema, isRideHarm, reasonsFor, reportSchema } from './schema'

describe('report reasons', () => {
  it('include fake items / ticket sales (terms of use, 2026-10-15)', () => {
    const r = reportSchema.safeParse({ kind: 'user', ref: 'x', reason: 'פריט מזויף / מכירת כרטיסים' })
    expect(r.success).toBe(true)
  })
  it('fit the database column (varchar 60)', () => {
    for (const reason of REPORT_REASONS) expect(reason.length).toBeLessThanOrEqual(60)
  })
  it('refuse a reason that is not on the list', () => {
    expect(reportSchema.safeParse({ kind: 'user', ref: 'x', reason: 'סתם' }).success).toBe(false)
  })
})

describe('the ride-harm reason (ride safety, rule 9)', () => {
  it('is offered on rides and fans only, never as the default', () => {
    expect(reasonsFor('trip')).toContain(RIDE_HARM_REASON)
    expect(reasonsFor('user')).toContain(RIDE_HARM_REASON)
    expect(reasonsFor('trip')[0]).toBe('הטרדה')
    expect(reasonsFor('clip')).not.toContain(RIDE_HARM_REASON)
    expect(reasonsFor('clip')).toHaveLength(REPORT_REASONS.length - 1)
  })
  it('is accepted only for a ride or a fan', () => {
    expect(reportSchema.safeParse({ kind: 'trip', ref: 'x', reason: RIDE_HARM_REASON }).success).toBe(true)
    expect(reportSchema.safeParse({ kind: 'user', ref: 'x', reason: RIDE_HARM_REASON }).success).toBe(true)
    expect(reportSchema.safeParse({ kind: 'clip', ref: 'x', reason: RIDE_HARM_REASON }).success).toBe(false)
    expect(isRideHarm('trip', RIDE_HARM_REASON)).toBe(true)
    expect(isRideHarm('trip', 'הטרדה')).toBe(false)
    expect(isRideHarm('team_message', RIDE_HARM_REASON)).toBe(false)
  })
})

describe('report kinds (migration 20261015180000_moderation_admin)', () => {
  it('include the team boards; a market item is reported by its own id', () => {
    for (const kind of ['market_item', 'trip', 'event', 'chant', 'review'] as const) {
      expect(REPORT_KINDS).toContain(kind)
      expect(reportSchema.safeParse({ kind, ref: 'x', reason: 'ספאם' }).success).toBe(true)
    }
  })
  it('never take a contact request through the report form (it has its own)', () => {
    expect(reportSchema.safeParse({ kind: 'contact', ref: 'x', reason: 'אחר' }).success).toBe(false)
  })
})

describe('contactSchema', () => {
  it('takes a topic from the list and up to 500 characters', () => {
    expect(contactSchema.safeParse({ topic: 'פרטיות', text: 'בקשה למחוק מידע' }).success).toBe(true)
    expect(contactSchema.safeParse({ topic: 'נגישות', text: 'א'.repeat(CONTACT_MAX) }).success).toBe(true)
    expect(contactSchema.safeParse({ topic: 'נגישות', text: 'א'.repeat(CONTACT_MAX + 1) }).success).toBe(false)
  })
  it('refuses an empty request or an unknown topic', () => {
    expect(contactSchema.safeParse({ topic: 'פרטיות', text: '   ' }).success).toBe(false)
    expect(contactSchema.safeParse({ topic: 'שיווק', text: 'שלום לכם' }).success).toBe(false)
  })
  it('topics fit the database column (reason varchar 60)', () => {
    for (const t of CONTACT_TOPICS) expect(t.length).toBeLessThanOrEqual(60)
  })
})
