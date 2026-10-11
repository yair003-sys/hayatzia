import { describe, expect, it } from 'vitest'
import { isInAppBrowser, toE164Israel } from './phone'

describe('toE164Israel', () => {
  it('accepts the usual ways fans write a mobile number', () => {
    expect(toE164Israel('050-000-0001')).toBe('+972500000001')
    expect(toE164Israel('+972 52 123 4567')).toBe('+972521234567')
    expect(toE164Israel('972541234567')).toBe('+972541234567')
  })
  it('rejects landlines and junk', () => {
    expect(toE164Israel('03-1234567')).toBeNull()
    expect(toE164Israel('12')).toBeNull()
  })
})

describe('isInAppBrowser', () => {
  it('spots Instagram and Facebook webviews', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 [FBAN/FBIOS;FBAV/400]')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1')).toBe(false)
  })
})
