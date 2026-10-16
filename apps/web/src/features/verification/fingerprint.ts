// The keyed fingerprint of a person (duplicate identity, 2026-10-16; security review): the national personal number and
// the issuing country, so an Israeli ID card, passport and driving licence of the same person give the same value.
// Computed on the server from what the provider returns; only the fingerprint reaches the database.
import { createHmac } from 'node:crypto'

/** ISO country, upper case; Israel as "IL" whether the provider says IL or ISR. */
export function normaliseCountry(country: string): string {
  const c = country.trim().toUpperCase()
  return c === 'ISR' ? 'IL' : c
}

/** Upper case, letters and digits only; an Israeli all-digit number shorter than 9 gets its leading zeros back. */
export function normalisePersonalNumber(n: string, country: string): string {
  const s = n.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normaliseCountry(country) === 'IL' && /^[0-9]{1,8}$/.test(s) ? s.padStart(9, '0') : s
}

/** HMAC-SHA256 (hex, 64 characters) of "<country>:<personal number>" with the server's fingerprint key. */
export function identityFingerprint(personalNumber: string, country: string, secret: string): string {
  const c = normaliseCountry(country)
  return createHmac('sha256', secret).update(`${c}:${normalisePersonalNumber(personalNumber, c)}`).digest('hex')
}
