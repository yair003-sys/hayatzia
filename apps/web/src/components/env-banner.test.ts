import { describe, expect, it } from 'vitest'
import { shouldShowEnvBanner } from './env-banner'

describe('shouldShowEnvBanner', () => {
  it('shows outside production', () => {
    expect(shouldShowEnvBanner('local')).toBe(true)
    expect(shouldShowEnvBanner('preview')).toBe(true)
  })
  it('never shows in production', () => {
    expect(shouldShowEnvBanner('production')).toBe(false)
  })
})
