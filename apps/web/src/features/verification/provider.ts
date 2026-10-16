// Identity verification behind one interface (spec 2026-10-16-ride-verification-emergency). A real provider (Didit,
// Veriff or AU10TIX, the owner's choice) is a new adapter implementing this; no schema change.

export type VerificationKind = 'identity' | 'licence'

/** What a provider's webhook tells us. The document number is used only to compute the fingerprint, never stored. */
export type VerificationResult = {
  /** Our session id (fan_verifications.id), echoed back by the provider. */
  sessionId: string
  /** The provider's own reference for the session (idempotency). */
  providerRef: string
  approved: boolean
  reasonCode: string | null
  /**
   * The national personal number on the document (an Israeli ID number on an ID card, passport or licence), used only
   * to compute the fingerprint, never stored. Null when the document has none (rejected doc_unsupported).
   */
  personalNumber: string | null
  /** Issuing country (ISO alpha-2 or alpha-3). */
  country: string | null
  /** YYYY-MM-DD, compared with profiles.birth_date in the database, never stored. */
  docBirthDate: string | null
  /** Driving licence issue date, YYYY-MM-DD. */
  licenceIssued: string | null
  /** Document expiry, YYYY-MM-DD. */
  docExpires: string | null
}

export interface VerificationProvider {
  readonly name: string
  startSession(input: { sessionId: string; userId: string; kind: VerificationKind }): Promise<{ url: string } | { sdkToken: string }>
  /** Checks the signature first; throws WebhookError('bad_signature' | 'bad_payload'). */
  parseWebhook(request: Request): Promise<VerificationResult>
}

export class WebhookError extends Error {
  constructor(readonly code: 'bad_signature' | 'bad_payload') {
    super(code)
    this.name = 'WebhookError'
  }
}
