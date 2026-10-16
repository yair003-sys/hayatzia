// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_ENV: 'local' } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => null }))

import { identityFingerprint } from '../fingerprint'
import { MOCK_SIGNATURE_HEADER, buildMockBody, createMockProvider, signMock } from '../mock-provider'
import { handleVerificationWebhook } from './webhook'

const SECRET = 's'.repeat(40)
const FP_KEY = 'f'.repeat(40)
const SESSION = '11111111-1111-4111-8111-111111111111'
const provider = createMockProvider({ appEnv: 'local', secret: SECRET })

type Rpc = { fn: string; args: Record<string, unknown> }
let calls: Rpc[] = []
let rpcResult: { data: string | null; error: { code?: string; message?: string } | null }
const admin = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args })
    return rpcResult
  },
}
const deps = () => ({ provider, admin, secret: FP_KEY }) as unknown as Parameters<typeof handleVerificationWebhook>[1]

const body = buildMockBody({
  sessionId: SESSION,
  providerRef: 'mock-1',
  approved: true,
  documentType: 'id_card',
  personalNumber: '123456782',
  country: 'ISR',
  birthDate: '1990-01-01',
})
const signed = (b = body, sig = signMock(b, SECRET)) =>
  new Request('http://localhost/api/verification/webhook', { method: 'POST', headers: { [MOCK_SIGNATURE_HEADER]: sig }, body: b })

let errors: { mock: { calls: unknown[][] }; mockRestore: () => void }
beforeEach(() => {
  calls = []
  rpcResult = { data: 'approved', error: null }
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errors.mockRestore())

describe('POST /api/verification/webhook', () => {
  it('a signed result is written once through the service-role RPC, with the fingerprint and never the number', async () => {
    const res = await handleVerificationWebhook(signed(), deps())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'approved' })
    expect(calls).toEqual([
      {
        fn: 'verification_result',
        args: {
          p_session: SESSION,
          p_provider: 'mock',
          p_provider_ref: 'mock-1',
          p_approved: true,
          p_fingerprint: identityFingerprint('123456782', 'IL', FP_KEY),
          p_doc_birth_date: '1990-01-01',
        },
      },
    ])
    expect(JSON.stringify(calls)).not.toContain('123456782')
  })

  it('an Israeli ID card and passport of the same person give the same fingerprint (duplicate_identity in the database)', async () => {
    const passport = buildMockBody({
      sessionId: '22222222-2222-4222-8222-222222222222',
      providerRef: 'mock-2',
      approved: true,
      documentType: 'passport',
      personalNumber: '123456782',
      country: 'IL',
      birthDate: '1990-01-01',
    })
    await handleVerificationWebhook(signed(), deps())
    await handleVerificationWebhook(signed(passport), deps())
    expect(calls).toHaveLength(2)
    expect(calls[0]?.args.p_fingerprint).toBe(calls[1]?.args.p_fingerprint)
  })

  it('a document without a personal number is sent without a fingerprint', async () => {
    const noNumber = buildMockBody({ sessionId: SESSION, providerRef: 'mock-3', approved: true, documentType: 'passport', country: 'FRA' })
    await handleVerificationWebhook(signed(noNumber), deps())
    expect(calls[0]?.args).not.toHaveProperty('p_fingerprint')
  })

  it('a body over 64 KB is refused before it is read', async () => {
    const big = new Request('http://localhost/api/verification/webhook', {
      method: 'POST',
      headers: { 'content-length': String(70_000), [MOCK_SIGNATURE_HEADER]: signMock(body, SECRET) },
      body,
    })
    const res = await handleVerificationWebhook(big, deps())
    expect(res.status).toBe(413)
    expect(big.bodyUsed).toBe(false)
    const huge = 'x'.repeat(70_000)
    expect((await handleVerificationWebhook(signed(huge), deps())).status).toBe(413)
    expect(calls).toEqual([])
  })

  it('a bad signature is refused before anything is written', async () => {
    const res = await handleVerificationWebhook(signed(body, signMock(body, 'x'.repeat(40))), deps())
    expect(res.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('a signed body that is not a result is a 400', async () => {
    const res = await handleVerificationWebhook(signed('{}'), deps())
    expect(res.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('no provider configured → 404; no fingerprint key → 503', async () => {
    expect((await handleVerificationWebhook(signed(), { ...deps(), provider: null })).status).toBe(404)
    expect((await handleVerificationWebhook(signed(), { ...deps(), secret: null })).status).toBe(503)
    expect((await handleVerificationWebhook(signed(), { ...deps(), admin: null })).status).toBe(503)
    expect(calls).toEqual([])
  })

  it('an unknown session is a 404; a database error is a 500, logged as a code only', async () => {
    rpcResult = { data: null, error: { code: 'P0002', message: 'bad_session' } }
    expect((await handleVerificationWebhook(signed(), deps())).status).toBe(404)
    rpcResult = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
    expect((await handleVerificationWebhook(signed(), deps())).status).toBe(500)
    const logged = JSON.stringify(errors.mock.calls)
    expect(logged).toContain('23505')
    expect(logged).not.toContain(SECRET)
    expect(logged).not.toContain(FP_KEY)
    expect(logged).not.toContain('123456782')
    expect(logged).not.toContain('duplicate key')
  })
})
