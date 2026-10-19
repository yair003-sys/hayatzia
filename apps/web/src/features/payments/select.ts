import { mockProvider } from './mock-provider'
import type { PaymentProvider } from './provider'

/**
 * The payment provider in force. Today only the mock exists, so every environment uses it and no real charge is
 * possible. A real adapter (Stripe Connect / Rapyd / …) is added here, behind explicit configuration, only after the
 * owner picks a provider and the lawyer signs off — a single, deliberate switch, never an accident.
 */
export function paymentProvider(): PaymentProvider {
  return mockProvider
}
