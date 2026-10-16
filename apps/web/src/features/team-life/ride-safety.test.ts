import { describe, expect, it } from 'vitest'
import {
  EMERGENCY_NUMBERS,
  accountAge,
  averageStars,
  filterRides,
  rideErrorHe,
  rideOver,
  shareText,
  trustLine,
} from './ride-safety'

const NOW = new Date('2026-10-15T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

describe('accountAge', () => {
  it('says how long the account exists in plain words', () => {
    expect(accountAge(daysAgo(0), NOW)).toBe('חשבון חדש מהיום')
    expect(accountAge(daysAgo(1), NOW)).toBe('בחשבון יום אחד')
    expect(accountAge(daysAgo(2), NOW)).toBe('בחשבון יומיים')
    expect(accountAge(daysAgo(12), NOW)).toBe('בחשבון 12 ימים')
    expect(accountAge(daysAgo(31), NOW)).toBe('בחשבון חודש')
    expect(accountAge(daysAgo(65), NOW)).toBe('בחשבון חודשיים')
    expect(accountAge(daysAgo(95), NOW)).toBe('בחשבון 3 חודשים')
    expect(accountAge(daysAgo(400), NOW)).toBe('בחשבון שנה')
    expect(accountAge(daysAgo(800), NOW)).toBe('בחשבון שנתיים')
  })
})

describe('trustLine', () => {
  it('matches the spec example', () => {
    expect(trustLine({ memberSince: daysAgo(95), ridesCompleted: 4, ratingsCount: 5, ratingsSum: 24, female: false }, NOW)).toBe(
      'בחשבון 3 חודשים · 4 נסיעות · ★ 4.8 (5)',
    )
  })
  it('states plainly when there is nothing yet', () => {
    expect(trustLine({ memberSince: daysAgo(3), ridesCompleted: 0, ratingsCount: 0, ratingsSum: 0, female: true }, NOW)).toBe(
      'בחשבון 3 ימים · עוד אין נסיעות · עוד בלי דירוג',
    )
    expect(trustLine({ memberSince: daysAgo(3), ridesCompleted: 1, ratingsCount: 1, ratingsSum: 5, female: true }, NOW)).toBe(
      'בחשבון 3 ימים · נסיעה אחת · ★ 5 (1)',
    )
  })
  it('averages to one decimal', () => {
    expect(averageStars(3, 13)).toBe('4.3')
    expect(averageStars(2, 8)).toBe('4')
    expect(averageStars(0, 0)).toBeNull()
  })
})

describe('shareText', () => {
  it('has the driver, the pickup point, the times and the link', () => {
    const text = shareText({
      driverNick: 'נהג',
      pickup: 'תחנת רכבת חוף הכרמל',
      fromCity: 'חיפה',
      kickoffSec: Date.parse('2026-10-17T17:00:00Z') / 1000,
      departBeforeMin: 120,
      match: 'נגד הפועל חדרה',
      url: 'https://example.test/stand/trips?trip=1',
    })
    expect(text).toContain('נהג')
    expect(text).toContain('איסוף: תחנת רכבת חוף הכרמל, חיפה')
    expect(text).toContain('18:00') // departure, Israel time
    expect(text).toContain('20:00') // kickoff, Israel time
    expect(text.endsWith('https://example.test/stand/trips?trip=1')).toBe(true)
  })
  it('falls back to the city for older rides without a pickup point', () => {
    expect(
      shareText({ driverNick: 'א', pickup: '', fromCity: 'חיפה', kickoffSec: 0, departBeforeMin: 60, match: 'x', url: 'u' }),
    ).toContain('איסוף: חיפה\n')
  })
})

describe('filterRides', () => {
  const trips = [
    { id: '1', kind: 'offer', user_id: 'a' },
    { id: '2', kind: 'offer', user_id: 'b' },
    { id: '3', kind: 'seek', user_id: 'a' },
    { id: '4', kind: 'offer', user_id: 'c' },
  ]
  const drivers = { a: { female: true }, b: { female: false } }
  it('keeps every ride without the filter', () => {
    expect(filterRides(trips, false, drivers)).toHaveLength(4)
  })
  it('"נהגות בלבד" keeps ride offers by women only', () => {
    expect(filterRides(trips, true, drivers).map((t) => t.id)).toEqual(['1'])
  })
})

describe('rideOver', () => {
  it('is over at full time or two hours after kickoff', () => {
    expect(rideOver('2026-10-15T11:00:00Z', 'FT', NOW)).toBe(true)
    expect(rideOver('2026-10-15T10:00:00Z', 'NS', NOW)).toBe(true)
    expect(rideOver('2026-10-15T10:30:00Z', '2H', NOW)).toBe(false)
  })
})

describe('ride copy', () => {
  it('maps the database codes to Hebrew', () => {
    expect(rideErrorHe('not_adult')).toMatch(/18/)
    expect(rideErrorHe('no_birth_date')).toBe('צריך להשלים תאריך לידה')
    expect(rideErrorHe('ride_suspended')).toMatch(/מושעה מנסיעות/)
    expect(rideErrorHe('women_only')).toMatch(/לאוהדות בלבד/)
    expect(rideErrorHe('phone_required')).toMatch(/טלפון/)
    expect(rideErrorHe('ride_started')).toMatch(/המשחק כבר התחיל/)
    expect(rideErrorHe('something else')).toBeNull()
  })
  it('lists the emergency numbers', () => {
    expect(EMERGENCY_NUMBERS.map((e) => e.number)).toEqual(['100', '1202', '1203'])
  })
})
