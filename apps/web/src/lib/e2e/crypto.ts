// End-to-end encryption for private messages, ported from the legacy app (same algorithms and constants).
// Every device has its own ECDH P-256 key pair; the private key is non-extractable and never leaves the device.
// Each message gets a fresh AES-256-GCM key, wrapped separately for every device of both fans with a key derived
// by HKDF-SHA-256 from the ECDH secret between the sender's device and that device. The server sees ciphertext only.
// Pure WebCrypto: runs in browsers and in Node (tests). No storage here (see keystore.ts).

const SALT = new TextEncoder().encode('hayatzia-dm')
const INFO = new TextEncoder().encode('wrap-v1')

export type DeviceKey = { id: string; privateKey: CryptoKey; publicJwk: string }
export type PublicDevice = { id: string; publicJwk: string }
export type WrappedKey = { i: string; w: string }
export type EncryptedMessage = { sender_device: string; iv: string; ciphertext: string; wrapped_keys: Record<string, WrappedKey> }

export const b64 = {
  en(buf: ArrayBuffer | Uint8Array): string {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    let s = ''
    for (const x of b) s += String.fromCharCode(x)
    return btoa(s)
  },
  de(str: string): Uint8Array<ArrayBuffer> {
    const s = atob(str)
    const b = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
    return b
  },
}

export async function createDeviceKey(): Promise<DeviceKey> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const j = await crypto.subtle.exportKey('jwk', kp.publicKey)
  const id = b64.en(crypto.getRandomValues(new Uint8Array(9))).replace(/[+/=]/g, 'x')
  return { id, privateKey: kp.privateKey, publicJwk: JSON.stringify({ kty: j.kty, crv: j.crv, x: j.x, y: j.y }) }
}

const sharedCache = new WeakMap<CryptoKey, Map<string, Promise<CryptoKey>>>()

/** AES-GCM key shared between my device and another device: HKDF(ECDH secret). Cached per key pair. */
export function sharedKey(myPrivate: CryptoKey, theirPublicJwk: string): Promise<CryptoKey> {
  const byPub = sharedCache.get(myPrivate) ?? new Map<string, Promise<CryptoKey>>()
  sharedCache.set(myPrivate, byPub)
  const hit = byPub.get(theirPublicJwk)
  if (hit) return hit
  const p = (async () => {
    const pub = await crypto.subtle.importKey('jwk', JSON.parse(theirPublicJwk), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, myPrivate, 256)
    const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: INFO },
      hkdf,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  })()
  byPub.set(theirPublicJwk, p)
  void p.catch(() => {
    byPub.delete(theirPublicJwk) // a malformed key is not cached as a failure forever
  })
  return p
}

/**
 * Encrypts for every given device (the recipient's and the sender's own, so the sender can read it back).
 * A device whose public key cannot be used (malformed or not a P-256 point) is skipped, so one broken key
 * cannot stop a message; throws 'no-recipient-key' when no device is left.
 */
export async function encryptMessage(text: string, me: DeviceKey, devices: PublicDevice[]): Promise<EncryptedMessage> {
  if (devices.length === 0) throw new Error('no-recipient-key')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text))
  const raw = await crypto.subtle.exportKey('raw', k)
  const wrapped: Record<string, WrappedKey> = {}
  await Promise.all(
    devices.map(async (d) => {
      let shared: CryptoKey
      try {
        shared = await sharedKey(me.privateKey, d.publicJwk)
      } catch {
        return // unusable public key: this device is skipped
      }
      const wi = crypto.getRandomValues(new Uint8Array(12))
      const w = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wi }, shared, raw)
      wrapped[d.id] = { i: b64.en(wi), w: b64.en(w) }
    }),
  )
  if (Object.keys(wrapped).length === 0) throw new Error('no-recipient-key')
  return { sender_device: me.id, iv: b64.en(iv), ciphertext: b64.en(ct), wrapped_keys: wrapped }
}

/** Decrypts a message on this device, given the sender device's public key. Throws if not addressed to this device. */
export async function decryptMessage(m: EncryptedMessage, me: DeviceKey, senderPublicJwk: string): Promise<string> {
  const k = m.wrapped_keys[me.id]
  if (!k) throw new Error('not-for-this-device')
  const sk = await sharedKey(me.privateKey, senderPublicJwk)
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.de(k.i) }, sk, b64.de(k.w))
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.de(m.iv) }, key, b64.de(m.ciphertext))
  return new TextDecoder().decode(pt)
}

/** A 12-digit code both fans can compare (in person or by phone) to be sure nobody swapped the keys. */
export async function safetyCode(publicJwks: string[]): Promise<string> {
  const all = [...publicJwks].sort().join('|')
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(all)))
  let s = ''
  for (let i = 0; i < 12; i++) s += String(h[i]! % 10)
  return s.replace(/(\d{4})(?=\d)/g, '$1 ')
}
