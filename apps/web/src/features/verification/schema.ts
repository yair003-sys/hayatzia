export type VerifyStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'expired'
export const VERIFY_ERRORS: Record<string, string> = {}
export function verificationErrorHe(_m: string | null | undefined): string | null {
  return null
}
export function statusLabel(_s: VerifyStatus, _r: string | null): string {
  return ''
}
export function normalisePlate(_i: string): string | null {
  return null
}
export function formatPlate(p: string): string {
  return p
}
