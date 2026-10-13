// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createDeviceKey, decryptMessage, encryptMessage, safetyCode } from './crypto'

describe('end-to-end encryption', () => {
  it('the recipient and the sender (other device too) can read, an outsider cannot', async () => {
    const alicePhone = await createDeviceKey()
    const aliceLaptop = await createDeviceKey()
    const bob = await createDeviceKey()
    const eve = await createDeviceKey()
    const pub = (d: { id: string; publicJwk: string }) => ({ id: d.id, publicJwk: d.publicJwk })

    const m = await encryptMessage('נפגשים בשער 11 🔥', alicePhone, [pub(bob), pub(alicePhone), pub(aliceLaptop)])

    expect(m.ciphertext).not.toContain('נפגשים')
    expect(Object.keys(m.wrapped_keys).sort()).toEqual([alicePhone.id, aliceLaptop.id, bob.id].sort())
    expect(await decryptMessage(m, bob, alicePhone.publicJwk)).toBe('נפגשים בשער 11 🔥')
    expect(await decryptMessage(m, aliceLaptop, alicePhone.publicJwk)).toBe('נפגשים בשער 11 🔥')
    await expect(decryptMessage(m, eve, alicePhone.publicJwk)).rejects.toThrow('not-for-this-device')
  })

  it('rejects a tampered message', async () => {
    const a = await createDeviceKey()
    const b = await createDeviceKey()
    const m = await encryptMessage('שלום', a, [{ id: b.id, publicJwk: b.publicJwk }])
    const bytes = Uint8Array.from(atob(m.ciphertext), (c) => c.charCodeAt(0))
    bytes[0]! ^= 1
    const tampered = { ...m, ciphertext: btoa(String.fromCharCode(...bytes)) }
    await expect(decryptMessage(tampered, b, a.publicJwk)).rejects.toThrow()
  })

  it('refuses to encrypt with no recipient device', async () => {
    await expect(encryptMessage('x', await createDeviceKey(), [])).rejects.toThrow('no-recipient-key')
  })

  it('skips a device whose public key is malformed and still encrypts for the others', async () => {
    const a = await createDeviceKey()
    const b = await createDeviceKey()
    const bad = { id: 'broken', publicJwk: JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'AAAA', y: 'AAAA' }) }
    const notJson = { id: 'garbage', publicJwk: '{not json' }
    const m = await encryptMessage('שלום', a, [bad, notJson, { id: b.id, publicJwk: b.publicJwk }, { id: a.id, publicJwk: a.publicJwk }])
    expect(Object.keys(m.wrapped_keys).sort()).toEqual([a.id, b.id].sort())
    expect(await decryptMessage(m, b, a.publicJwk)).toBe('שלום')
  })

  it('refuses to encrypt when every recipient key is malformed', async () => {
    await expect(encryptMessage('x', await createDeviceKey(), [{ id: 'broken', publicJwk: '{"kty":"EC"}' }])).rejects.toThrow('no-recipient-key')
  })

  it('gives both fans the same safety code regardless of order', async () => {
    const a = await createDeviceKey()
    const b = await createDeviceKey()
    const code = await safetyCode([a.publicJwk, b.publicJwk])
    expect(code).toMatch(/^\d{4} \d{4} \d{4}$/)
    expect(await safetyCode([b.publicJwk, a.publicJwk])).toBe(code)
  })
})
