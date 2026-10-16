import 'server-only'
import type { VerificationProvider } from '../provider'
export function getVerificationProvider(): VerificationProvider | null {
  throw new Error('not implemented')
}
export function fingerprintSecret(): string | null {
  throw new Error('not implemented')
}
export function mockWebhookSecret(): string {
  throw new Error('not implemented')
}
