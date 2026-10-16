// The mock identity provider: local, CI and staging only (never production). Its "session" is a demo screen inside the
// app (/me/verify/demo), and its webhook is signed like a real provider's (hex HMAC-SHA256 of the raw body), so the
// webhook route, the signature check and the database path are the same ones a real provider will use.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { AppEnv } from '@/lib/env'
import { WebhookError, type VerificationProvider, type VerificationResult } from './provider'

export const MOCK_SIGNATURE_HEADER = 'x-onefan-signature'

export function signMock(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

const day = z.iso.date()
const mockBody = z.object({
  session_id: z.uuid(),
  provider_ref: z.string().min(1).max(120),
  status: z.enum(['approved', 'declined']),
  reason: z.string().max(40).optional(),
  document_number: z.string().max(40).optional(),
  birth_date: day.optional(),
  licence_issued: day.optional(),
  expires: day.optional(),
})

export function buildMockBody(i: {
  sessionId: string
  providerRef: string
  approved: boolean
  reason?: string
  documentNumber?: string
  birthDate?: string
  licenceIssued?: string
  expires?: string
}): string {
  return JSON.stringify({
    session_id: i.sessionId,
    provider_ref: i.providerRef,
    status: i.approved ? 'approved' : 'declined',
    reason: i.reason,
    document_number: i.documentNumber,
    birth_date: i.birthDate,
    licence_issued: i.licenceIssued,
    expires: i.expires,
  } satisfies Partial<z.input<typeof mockBody>>)
}

function signatureOk(body: string, given: string | null, secret: string): boolean {
  if (!given || !/^[0-9a-f]{64}$/.test(given)) return false
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(signMock(body, secret), 'hex'))
}

export function createMockProvider({ appEnv, secret }: { appEnv: AppEnv; secret: string }): VerificationProvider {
  if (appEnv === 'production') throw new Error('The mock verification provider never runs in production.')
  return {
    name: 'mock',
    async startSession({ sessionId }) {
      return { url: `/me/verify/demo?session=${sessionId}` }
    },
    async parseWebhook(request: Request): Promise<VerificationResult> {
      const body = await request.text()
      if (!signatureOk(body, request.headers.get(MOCK_SIGNATURE_HEADER), secret)) throw new WebhookError('bad_signature')
      let json: unknown
      try {
        json = JSON.parse(body)
      } catch {
        throw new WebhookError('bad_payload')
      }
      const p = mockBody.safeParse(json)
      if (!p.success) throw new WebhookError('bad_payload')
      return {
        sessionId: p.data.session_id,
        providerRef: p.data.provider_ref,
        approved: p.data.status === 'approved',
        reasonCode: p.data.reason ?? null,
        documentNumber: p.data.document_number ?? null,
        docBirthDate: p.data.birth_date ?? null,
        licenceIssued: p.data.licence_issued ?? null,
        docExpires: p.data.expires ?? null,
      }
    },
  }
}
