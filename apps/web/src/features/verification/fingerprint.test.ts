// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { identityFingerprint, normaliseCountry, normalisePersonalNumber } from './fingerprint'

const KEY = 'k'.repeat(40)

describe('identityFingerprint (personal number + issuing country, security review 2026-10-16)', () => {
  it('is a stable 64-hex keyed hash, never the number itself', () => {
    const fp = identityFingerprint('123456782', 'IL', KEY)
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
    expect(fp).toBe(identityFingerprint('123456782', 'IL', KEY))
    expect(fp).not.toContain('123456782')
  })
  it('the same person on any Israeli document (ID card, passport, licence; alpha-2 or alpha-3; leading zeros)', () => {
    const id = identityFingerprint('012345678', 'ISR', KEY)
    expect(identityFingerprint('12345678', 'IL', KEY)).toBe(id)
    expect(identityFingerprint(' 01-2345678 ', 'il', KEY)).toBe(id)
  })
  it('another country is another person; another secret another hash', () => {
    expect(identityFingerprint('12345678', 'FR', KEY)).not.toBe(identityFingerprint('12345678', 'IL', KEY))
    expect(identityFingerprint('12345678', 'IL', KEY)).not.toBe(identityFingerprint('12345678', 'IL', 'z'.repeat(40)))
  })
  it('normalises', () => {
    expect(normalisePersonalNumber(' 12345678 ', 'IL')).toBe('012345678')
    expect(normalisePersonalNumber('ab-12', 'FR')).toBe('AB12')
    expect(normaliseCountry('isr')).toBe('IL')
    expect(normaliseCountry('fra')).toBe('FRA')
  })
})
