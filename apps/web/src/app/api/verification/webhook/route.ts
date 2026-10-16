import { handleVerificationWebhook } from '@/features/verification/server/webhook'

/**
 * The identity provider's result for a verification session (rides, 2026-10-16). Signed by the provider; anything
 * unsigned or wrongly signed → 401 before anything is read from or written to the database.
 */
export async function POST(request: Request): Promise<Response> {
  return handleVerificationWebhook(request)
}
