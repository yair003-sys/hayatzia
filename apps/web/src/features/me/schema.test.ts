import { describe, expect, it } from 'vitest'
import { fanNumber, memberSince } from './schema'

describe('fan card', () => {
  it('shows the fan number of the club with leading zeros', () => {
    expect(fanNumber(1)).toBe('#0001')
    expect(fanNumber(214)).toBe('#0214')
    expect(fanNumber(12345)).toBe('#12345')
  })

  it('shows the month the fan joined in Hebrew', () => {
    expect(memberSince('2026-10-11T09:00:00Z')).toBe('אוקטובר 2026')
    expect(memberSince('2027-01-31T23:30:00Z')).toBe('פברואר 2027') // Israel time is already February
  })
})
