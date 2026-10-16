// The keyed fingerprint of an ID document number (duplicate identity, 2026-10-16). Computed on the server from what the
// provider returns; only the fingerprint reaches the database, never the number.
import { createHmac } from 'node:crypto'

/** Upper case, letters and digits only; an all-digit number shorter than 9 is an Israeli ID without leading zeros. */
export function normaliseDocNumber(n: string): string {
  const s = n.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[0-9]{1,8}$/.test(s) ? s.padStart(9, '0') : s
}

/** HMAC-SHA256 (hex, 64 characters) of the normalised number with the server's fingerprint key. */
export function docFingerprint(documentNumber: string, secret: string): string {
  return createHmac('sha256', secret).update(normaliseDocNumber(documentNumber)).digest('hex')
}

export function normaliseCountry(_c: string): string {
  throw new Error('not implemented')
}
export function normalisePersonalNumber(_n: string, _c: string): string {
  throw new Error('not implemented')
}
export function identityFingerprint(_n: string, _c: string, _secret: string): string {
  throw new Error('not implemented')
}
