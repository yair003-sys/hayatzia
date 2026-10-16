import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { identityFingerprint } from '../fingerprint'
import { WebhookError, type VerificationProvider } from '../provider'
import { fingerprintSecret, getVerificationProvider } from './select-provider'

type Admin = NonNullable<ReturnType<typeof createAdminClient>>
type Deps = { provider: VerificationProvider | null; admin: Admin | null; secret: string | null }

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status })

/** A provider result is a few hundred bytes; anything over this is refused (security review, L5). */
export const MAX_WEBHOOK_BYTES = 64 * 1024

/** The body as text, or null when it is larger than the cap (read chunk by chunk, never past the cap). */
async function readCapped(request: Request): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_WEBHOOK_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * The identity provider's result → the database (POST /api/verification/webhook, and the demo screen in-process).
 * Bodies over 64 KB are refused unread. The signature is checked before anything else; the national personal number
 * (+ issuing country) becomes a keyed fingerprint here and is never sent on
 * or stored; the write goes through verification_result() with the service role (one decision per session, so a
 * repeated webhook changes nothing). Logs carry codes only, never the body, a secret or a database message.
 */
export async function handleVerificationWebhook(request: Request, deps: Partial<Deps> = {}): Promise<Response> {
  const provider = 'provider' in deps ? (deps.provider ?? null) : getVerificationProvider()
  if (!provider) return json(404, { error: 'not_configured' })
  const secret = 'secret' in deps ? (deps.secret ?? null) : fingerprintSecret()
  if (!secret) {
    console.error('verification webhook', 'no_fingerprint_secret')
    return json(503, { error: 'not_configured' })
  }

  if (Number(request.headers.get('content-length') ?? 0) > MAX_WEBHOOK_BYTES) return json(413, { error: 'too_large' })
  const raw = await readCapped(request)
  if (raw === null) return json(413, { error: 'too_large' })

  let result
  try {
    const headers = new Headers(request.headers)
    headers.delete('content-length')
    result = await provider.parseWebhook(new Request(request.url, { method: 'POST', headers, body: raw }))
  } catch (e) {
    const code = e instanceof WebhookError ? e.code : 'bad_payload'
    console.error('verification webhook', code)
    return json(code === 'bad_signature' ? 401 : 400, { error: code })
  }

  const admin = 'admin' in deps ? (deps.admin ?? null) : createAdminClient()
  if (!admin) {
    console.error('verification webhook', 'no_admin_client')
    return json(503, { error: 'not_configured' })
  }
  // Missing values are left out (the function's defaults are null).
  const { data, error } = await admin.rpc('verification_result', {
    p_session: result.sessionId,
    p_provider: provider.name,
    p_provider_ref: result.providerRef,
    p_approved: result.approved,
    ...(result.reasonCode ? { p_reason: result.reasonCode } : {}),
    ...(result.personalNumber && result.country
      ? { p_fingerprint: identityFingerprint(result.personalNumber, result.country, secret) }
      : {}),
    ...(result.docBirthDate ? { p_doc_birth_date: result.docBirthDate } : {}),
    ...(result.licenceIssued ? { p_licence_issued: result.licenceIssued } : {}),
    ...(result.docExpires ? { p_doc_expires: result.docExpires } : {}),
  })
  if (error) {
    if (error.message?.includes('bad_session')) return json(404, { error: 'bad_session' })
    console.error('verification webhook', error.code ?? 'db_error')
    return json(500, { error: 'failed' })
  }
  return json(200, { status: data })
}
