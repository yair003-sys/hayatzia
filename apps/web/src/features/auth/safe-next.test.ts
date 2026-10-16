import { describe, expect, it } from 'vitest'
import { safeNext } from './safe-next'

describe('safeNext', () => {
  it('keeps app pages and the add page of a QR code', () => {
    expect(safeNext('/inbox')).toBe('/inbox')
    expect(safeNext('/add/abcDEF123_-abcDEF123_-x')).toBe('/add/abcDEF123_-abcDEF123_-x')
  })
  it('takes another fallback (after sign-up: the stand)', () => {
    expect(safeNext(null, '/stand')).toBe('/stand')
    expect(safeNext('https://evil.example', '/stand')).toBe('/stand')
    expect(safeNext('/add/abcDEF123_-abcDEF123_-x', '/stand')).toBe('/add/abcDEF123_-abcDEF123_-x')
  })
  it('sends anything else to onboarding (no open redirect)', () => {
    expect(safeNext(null)).toBe('/onboarding')
    expect(safeNext('https://evil.example')).toBe('/onboarding')
    expect(safeNext('//evil.example/add/abcDEF123_-abcDEF123_-x')).toBe('/onboarding')
    expect(safeNext('/add/short')).toBe('/onboarding')
    expect(safeNext('/add/abcDEF123_-abcDEF123_-x/../../x')).toBe('/onboarding')
  })
})
