// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { docFingerprint, normaliseDocNumber } from './fingerprint'

const KEY = 'k'.repeat(40)

describe('docFingerprint', () => {
  it('is a stable 64-hex keyed hash, never the number itself', () => {
    const fp = docFingerprint('123456782', KEY)
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
    expect(fp).toBe(docFingerprint('123456782', KEY))
    expect(fp).not.toContain('123456782')
  })
  it('the same document however it is written', () => {
    expect(docFingerprint('012345678', KEY)).toBe(docFingerprint('12345678', KEY))
    expect(docFingerprint('ab-12 34', KEY)).toBe(docFingerprint('AB1234', KEY))
  })
  it('depends on the secret', () => {
    expect(docFingerprint('123456782', KEY)).not.toBe(docFingerprint('123456782', 'z'.repeat(40)))
  })
  it('normalises: upper case, letters and digits only, Israeli ID numbers padded to 9', () => {
    expect(normaliseDocNumber(' 12345678 ')).toBe('012345678')
    expect(normaliseDocNumber('demo-abc')).toBe('DEMOABC')
  })
})
