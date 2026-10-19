import { beforeEach, describe, expect, it } from 'vitest'
import { _mock, mockProvider } from './mock-provider'

const input = { amountAgorot: 5000, beneficiaryRef: 'acct_1', feeAgorot: 250, campaignId: 'c1', contributionId: 'k1' }

beforeEach(() => _mock.reset())

describe('mockProvider', () => {
  it('authorizes a hold and returns an opaque reference', async () => {
    const r = await mockProvider.authorize(input)
    expect(r.ok).toBe(true)
    if (r.ok) expect(_mock.status(r.ref)).toBe('held')
  })

  it('rejects a non-positive amount', async () => {
    expect((await mockProvider.authorize({ ...input, amountAgorot: 0 })).ok).toBe(false)
  })

  it('captures a held reference once, then refuses to capture again', async () => {
    const r = await mockProvider.authorize(input)
    if (!r.ok) throw new Error('authorize failed')
    expect((await mockProvider.capture(r.ref)).ok).toBe(true)
    expect(_mock.status(r.ref)).toBe('captured')
    expect((await mockProvider.capture(r.ref)).ok).toBe(false) // already captured
  })

  it('releases a held reference and then cannot capture it', async () => {
    const r = await mockProvider.authorize(input)
    if (!r.ok) throw new Error('authorize failed')
    expect((await mockProvider.release(r.ref)).ok).toBe(true)
    expect(_mock.status(r.ref)).toBe('released')
    expect((await mockProvider.capture(r.ref)).ok).toBe(false)
  })

  it('refunds only a captured reference', async () => {
    const r = await mockProvider.authorize(input)
    if (!r.ok) throw new Error('authorize failed')
    expect((await mockProvider.refund(r.ref)).ok).toBe(false) // still held, nothing to refund
    await mockProvider.capture(r.ref)
    expect((await mockProvider.refund(r.ref)).ok).toBe(true)
    expect(_mock.status(r.ref)).toBe('refunded')
  })

  it('fails on an unknown reference', async () => {
    expect((await mockProvider.capture('nope')).ok).toBe(false)
  })
})
