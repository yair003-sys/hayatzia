import type { AppEnv } from '@/lib/env'
import type { VerificationProvider } from './provider'
export const MOCK_SIGNATURE_HEADER = 'x-onefan-signature'
export function signMock(_body: string, _secret: string): string {
  throw new Error('not implemented')
}
export function buildMockBody(_i: {
  sessionId: string
  providerRef: string
  approved: boolean
  reason?: string
  documentNumber?: string
  birthDate?: string
  licenceIssued?: string
  expires?: string
}): string {
  throw new Error('not implemented')
}
export function createMockProvider(_o: { appEnv: AppEnv; secret: string }): VerificationProvider {
  throw new Error('not implemented')
}
