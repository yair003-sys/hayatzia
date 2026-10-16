import 'server-only'
import { randomBytes } from 'node:crypto'
import { env } from '@/lib/env'
import { createMockProvider } from '../mock-provider'
import type { VerificationProvider } from '../provider'

/** Outside production only: staging and local data are test data, so a fixed, public key is enough there. */
const NON_PRODUCTION_FINGERPRINT_KEY = 'onefan-non-production-fingerprint-key (not a secret)'

// Without a configured secret the mock signs with a key that exists only inside this server process: the demo screen
// signs and checks in the same request, and nobody outside can forge a result. Made on first use (never while a page
// is being prerendered).
let processSecret: string | null = null

export function mockWebhookSecret(): string {
  const configured = env.VERIFICATION_WEBHOOK_SECRET?.replace(/\s+/g, '')
  if (configured) return configured
  processSecret ??= randomBytes(32).toString('hex')
  return processSecret
}

export function fingerprintSecret(): string | null {
  const key = env.VERIFICATION_FINGERPRINT_SECRET?.replace(/\s+/g, '')
  if (key) return key
  return env.NEXT_PUBLIC_APP_ENV === 'production' ? null : NON_PRODUCTION_FINGERPRINT_KEY
}

/**
 * The provider of this environment, or null (verification not available). Outside production the default is the mock;
 * in production there is no real provider yet, and the mock is refused even when asked for.
 */
export function getVerificationProvider(): VerificationProvider | null {
  const appEnv = env.NEXT_PUBLIC_APP_ENV
  const name = env.VERIFICATION_PROVIDER ?? (appEnv === 'production' ? undefined : 'mock')
  if (name !== 'mock') return null
  try {
    return createMockProvider({ appEnv, secret: mockWebhookSecret() })
  } catch {
    console.error('verification provider refused', 'mock_in_production')
    return null
  }
}
