import { describe, expect, it } from 'vitest'
import { VERIFY_ERRORS, formatPlate, normalisePlate, statusLabel, verificationErrorHe } from './schema'

const CODES = [
  'verify_identity',
  'verify_licence',
  'no_car',
  'peer_not_verified',
  'verify_limit',
  'already_verified',
  'duplicate_identity',
  'dob_mismatch',
  'licence_too_new',
  'doc_expired',
  'bad_fingerprint',
  'not_in_ride',
  'emergency_window',
  'plate_not_found',
  'registry_unavailable',
  'bad_plate',
]

describe('verificationErrorHe', () => {
  it('has Hebrew for every database and lookup code', () => {
    for (const code of CODES) {
      const he = verificationErrorHe(`ERROR: ${code}`)
      expect(he, code).toBeTruthy()
      expect(he, code).toMatch(/[א-ת]/)
      expect(he, code).not.toContain(code)
    }
    expect(Object.keys(VERIFY_ERRORS).sort()).toEqual([...CODES].sort())
  })
  it('null for anything else', () => {
    expect(verificationErrorHe('rate_limit')).toBeNull()
    expect(verificationErrorHe(null)).toBeNull()
    expect(verificationErrorHe(undefined)).toBeNull()
  })
  it('says what to do next', () => {
    expect(verificationErrorHe('verify_identity')).toBe('כדי לנסוע צריך לאמת זהות: תעודה מזהה וסריקת פנים')
    expect(verificationErrorHe('licence_too_new')).toBe('כדי לנהוג בנסיעה צריך רישיון נהיגה של שנתיים לפחות')
  })
})

describe('statusLabel', () => {
  it('plain words per status, with the reason of a rejection', () => {
    expect(statusLabel('none', null)).toBe('עוד לא אומת')
    expect(statusLabel('pending', null)).toBe('בבדיקה')
    expect(statusLabel('approved', null)).toBe('מאומת')
    expect(statusLabel('expired', null)).toBe('פג תוקף, צריך לאמת שוב')
    expect(statusLabel('rejected', 'dob_mismatch')).toMatch(/^נדחה: תאריך הלידה בתעודה/)
    expect(statusLabel('rejected', 'declined')).toBe('נדחה')
  })
})

describe('plates', () => {
  it('normalises what fans type', () => {
    expect(normalisePlate('12-345-67')).toBe('1234567')
    expect(normalisePlate(' 123 45 678 ')).toBe('12345678')
    expect(normalisePlate('123')).toBeNull()
    expect(normalisePlate('123456789')).toBeNull()
    expect(normalisePlate('12-3a5-67')).toBeNull()
  })
  it('formats like the plate on the car', () => {
    expect(formatPlate('1234567')).toBe('12-345-67')
    expect(formatPlate('12345678')).toBe('123-45-678')
  })
})
