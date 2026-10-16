// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MOCK_SIGNATURE_HEADER, buildMockBody, createMockProvider, signMock } from './mock-provider'
import { WebhookError } from './provider'

const SECRET = 'm'.repeat(40)
const SESSION = '11111111-1111-4111-8111-111111111111'

function req(body: string, signature?: string) {
  return new Request('http://localhost/api/verification/webhook', {
    method: 'POST',
    headers: signature === undefined ? {} : { [MOCK_SIGNATURE_HEADER]: signature },
    body,
  })
}

async function code(p: Promise<unknown>) {
  try {
    await p
    return 'resolved'
  } catch (e) {
    return e instanceof WebhookError ? e.code : 'other'
  }
}

describe('mock provider', () => {
  it('refuses to exist in production', () => {
    expect(() => createMockProvider({ appEnv: 'production', secret: SECRET })).toThrow(/production/)
    expect(createMockProvider({ appEnv: 'preview', secret: SECRET }).name).toBe('mock')
    expect(createMockProvider({ appEnv: 'local', secret: SECRET }).name).toBe('mock')
  })

  it('starts a demo session inside the app', async () => {
    const p = createMockProvider({ appEnv: 'local', secret: SECRET })
    expect(await p.startSession({ sessionId: SESSION, userId: 'u', kind: 'identity' })).toEqual({
      url: `/me/verify/demo?session=${SESSION}`,
    })
  })

  it('parses a correctly signed result', async () => {
    const p = createMockProvider({ appEnv: 'local', secret: SECRET })
    const body = buildMockBody({
      sessionId: SESSION,
      providerRef: 'mock-1',
      approved: true,
      documentType: 'licence',
      personalNumber: '012345678',
      country: 'ISR',
      birthDate: '1990-01-01',
      licenceIssued: '2015-05-05',
    })
    expect(await p.parseWebhook(req(body, signMock(body, SECRET)))).toEqual({
      sessionId: SESSION,
      providerRef: 'mock-1',
      approved: true,
      reasonCode: null,
      personalNumber: '012345678',
      country: 'ISR',
      docBirthDate: '1990-01-01',
      licenceIssued: '2015-05-05',
      docExpires: null,
    })
  })

  it('refuses a missing, wrong or tampered signature', async () => {
    const p = createMockProvider({ appEnv: 'local', secret: SECRET })
    const body = buildMockBody({ sessionId: SESSION, providerRef: 'mock-1', approved: true })
    expect(await code(p.parseWebhook(req(body)))).toBe('bad_signature')
    expect(await code(p.parseWebhook(req(body, signMock(body, 'x'.repeat(40)))))).toBe('bad_signature')
    expect(await code(p.parseWebhook(req(body.replace('"approved"', '"declined"'), signMock(body, SECRET))))).toBe('bad_signature')
    expect(await code(p.parseWebhook(req(body, 'abc')))).toBe('bad_signature')
  })

  it('refuses a signed body that is not a result', async () => {
    const p = createMockProvider({ appEnv: 'local', secret: SECRET })
    for (const body of ['not json', '{"session_id":"nope","provider_ref":"x","status":"approved"}', '{}']) {
      expect(await code(p.parseWebhook(req(body, signMock(body, SECRET))))).toBe('bad_payload')
    }
  })

  it('a document without a personal number comes back without one (the database refuses it: doc_unsupported)', async () => {
    const p = createMockProvider({ appEnv: 'local', secret: SECRET })
    const body = buildMockBody({ sessionId: SESSION, providerRef: 'mock-2', approved: true, documentType: 'passport', country: 'FRA' })
    expect(await p.parseWebhook(req(body, signMock(body, SECRET)))).toMatchObject({ personalNumber: null, country: 'FRA' })
  })

  it('signatures are hex HMAC-SHA256', () => {
    expect(signMock('abc', SECRET)).toMatch(/^[0-9a-f]{64}$/)
    expect(signMock('abc', SECRET)).not.toBe(signMock('abd', SECRET))
  })
})
