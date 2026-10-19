// The one seam through which any money ever moves. onefan is NOT custodial: a provider holds the money and splits it
// straight to the beneficiary, taking onefan's fee on the side. Nothing here touches card data — the card is entered
// on the provider's own hosted page, and we keep only an opaque reference. The shared contract (also for bus trips):
// authorize a hold, then capture it on success or release it if the goal is missed; refund reverses a capture.
//
// Launch is mock-first: a real adapter (Stripe Connect / Rapyd / …) is plugged in only after the owner picks a
// provider and the lawyer signs off. Until then every call goes to the in-memory mock, and no real charge is possible.

export type Agorot = number // whole agorot; money is always an integer, never a float

export type AuthorizeInput = {
  amountAgorot: Agorot
  /** The beneficiary's sub-merchant/connected account at the provider (the money's real destination). */
  beneficiaryRef: string
  /** onefan's cut for this charge, computed elsewhere; the provider splits it out on capture. */
  feeAgorot: Agorot
  /** Our own ids, passed through for reconciliation against the provider's webhooks. */
  campaignId: string
  contributionId: string
}

export type AuthorizeResult = { ok: true; ref: string } | { ok: false; error: string }
export type SettleResult = { ok: true } | { ok: false; error: string }

export interface PaymentProvider {
  /** A short name stored on each contribution (`provider` column), e.g. 'mock', 'stripe', 'rapyd'. */
  readonly name: string
  /** Place a hold on the backer's card (J5). Returns an opaque reference; never card data. */
  authorize(input: AuthorizeInput): Promise<AuthorizeResult>
  /** Goal reached → charge the held amount and split beneficiary + onefan fee. */
  capture(ref: string): Promise<SettleResult>
  /** Goal missed → drop the hold; the backer is never charged. */
  release(ref: string): Promise<SettleResult>
  /** Reverse a capture (e.g. a cancelled campaign after payout rules allow it). */
  refund(ref: string): Promise<SettleResult>
}
