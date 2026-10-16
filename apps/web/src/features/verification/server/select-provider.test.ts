// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_APP_ENV: 'local' as 'local' | 'preview' | 'production',
    VERIFICATION_PROVIDER: undefined as 'mock' | undefined,
    VERIFICATION_WEBHOOK_SECRET: undefined as string | undefined,
    VERIFICATION_FINGERPRINT_SECRET: undefined as string | undefined,
  },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: mocks.env }))

import { fingerprintSecret, getVerificationProvider, mockWebhookSecret } from './select-provider'

beforeEach(() => {
  mocks.env.NEXT_PUBLIC_APP_ENV = 'local'
  mocks.env.VERIFICATION_PROVIDER = undefined
  mocks.env.VERIFICATION_WEBHOOK_SECRET = undefined
  mocks.env.VERIFICATION_FINGERPRINT_SECRET = undefined
})

describe('getVerificationProvider', () => {
  it('local and preview use the mock provider by default', () => {
    expect(getVerificationProvider()?.name).toBe('mock')
    mocks.env.NEXT_PUBLIC_APP_ENV = 'preview'
    expect(getVerificationProvider()?.name).toBe('mock')
  })
  it('production never runs the mock, even when asked to', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.env.NEXT_PUBLIC_APP_ENV = 'production'
    expect(getVerificationProvider()).toBeNull()
    mocks.env.VERIFICATION_PROVIDER = 'mock'
    expect(getVerificationProvider()).toBeNull()
    expect(err).toHaveBeenCalledWith('verification provider refused', 'mock_in_production')
    err.mockRestore()
  })
})

describe('secrets', () => {
  it('the fingerprint key: the env value, a fixed non-production key, nothing in production without one', () => {
    expect(fingerprintSecret()).toMatch(/non-production/)
    mocks.env.VERIFICATION_FINGERPRINT_SECRET = 'f'.repeat(40)
    expect(fingerprintSecret()).toBe('f'.repeat(40))
    mocks.env.NEXT_PUBLIC_APP_ENV = 'production'
    expect(fingerprintSecret()).toBe('f'.repeat(40))
    mocks.env.VERIFICATION_FINGERPRINT_SECRET = undefined
    expect(fingerprintSecret()).toBeNull()
  })
  it('the mock webhook secret: the env value, else a random one per server process (nobody outside can sign)', () => {
    const a = mockWebhookSecret()
    expect(a.length).toBeGreaterThanOrEqual(32)
    expect(mockWebhookSecret()).toBe(a)
    mocks.env.VERIFICATION_WEBHOOK_SECRET = 'w'.repeat(40)
    expect(mockWebhookSecret()).toBe('w'.repeat(40))
  })
})
