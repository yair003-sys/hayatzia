import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({ n: 0 }))
vi.mock('./crypto', () => ({
  createDeviceKey: async () => {
    const n = ++created.n
    await new Promise((r) => setTimeout(r, 5))
    return { id: `dev-${n}`, privateKey: { fake: n }, publicJwk: `pub-${n}` }
  },
}))

/** Just enough IndexedDB for the keystore: one object store, async success callbacks. */
function fakeIndexedDb() {
  const data = new Map<string, unknown>()
  const later = (fn: () => void) => setTimeout(fn, 1)
  const db = {
    createObjectStore: () => {},
    transaction: () => {
      const tx: { oncomplete?: () => void; onerror?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          get: (k: string) => {
            const rq: { result?: unknown; onsuccess?: () => void } = {}
            later(() => {
              rq.result = data.get(k)
              rq.onsuccess?.()
            })
            return rq
          },
          put: (v: unknown, k: string) => {
            data.set(k, v)
            later(() => tx.oncomplete?.())
          },
        }),
      }
      return tx
    },
  }
  return {
    data,
    open: () => {
      const rq: { result?: unknown; onsuccess?: () => void; onupgradeneeded?: () => void } = {}
      later(() => {
        rq.result = db
        rq.onsuccess?.()
      })
      return rq
    },
  }
}

describe('loadDeviceKey', () => {
  beforeEach(() => {
    created.n = 0
    vi.resetModules()
    vi.stubGlobal('indexedDB', fakeIndexedDb())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('two screens loading at once on a fresh device share one new key (never two keys for one device)', async () => {
    const { loadDeviceKey } = await import('./keystore')
    const [a, b] = await Promise.all([loadDeviceKey('u1'), loadDeviceKey('u1')])
    expect(created.n).toBe(1)
    expect(a.key.id).toBe(b.key.id)
  })

  it('later loads reuse the stored key', async () => {
    const { loadDeviceKey } = await import('./keystore')
    const first = await loadDeviceKey('u1')
    const again = await loadDeviceKey('u1')
    expect(created.n).toBe(1)
    expect(again.key.id).toBe(first.key.id)
  })

  it('different fans get different keys', async () => {
    const { loadDeviceKey } = await import('./keystore')
    const [a, b] = await Promise.all([loadDeviceKey('u1'), loadDeviceKey('u2')])
    expect(a.key.id).not.toBe(b.key.id)
  })
})
