import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({ n: 0, failNext: false }))
vi.mock('./crypto', () => ({
  createDeviceKey: async () => {
    if (created.failNext) {
      created.failNext = false
      throw new Error('no crypto')
    }
    const n = ++created.n
    await new Promise((r) => setTimeout(r, 5))
    return { id: `dev-${n}`, privateKey: { fake: n }, publicJwk: `pub-${n}` }
  },
}))

/** Just enough IndexedDB for the keystore: one object store, async success callbacks. */
function fakeIndexedDb() {
  const data = new Map<string, unknown>()
  const reads = { n: 0 }
  const later = (fn: () => void) => setTimeout(fn, 1)
  const db = {
    createObjectStore: () => {},
    transaction: () => {
      const tx: { oncomplete?: () => void; onerror?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          get: (k: string) => {
            reads.n += 1
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
    reads,
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

let idb: ReturnType<typeof fakeIndexedDb>

describe('loadDeviceKey', () => {
  beforeEach(() => {
    created.n = 0
    created.failNext = false
    vi.resetModules()
    idb = fakeIndexedDb()
    vi.stubGlobal('indexedDB', idb)
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

  it('a failed load is forgotten: the next call tries again', async () => {
    const { loadDeviceKey } = await import('./keystore')
    created.failNext = true
    await expect(loadDeviceKey('u1')).rejects.toThrow('no crypto')
    const again = await loadDeviceKey('u1')
    expect(again.key.id).toBe('dev-1')
  })

  it('only a load in flight is shared: a later call reads IndexedDB again', async () => {
    const { loadDeviceKey } = await import('./keystore')
    await loadDeviceKey('u1')
    const before = idb.reads.n
    await loadDeviceKey('u1')
    expect(idb.reads.n).toBe(before + 1)
  })
})

describe('peekDeviceKey', () => {
  beforeEach(() => {
    created.n = 0
    created.failNext = false
    vi.resetModules()
    idb = fakeIndexedDb()
    vi.stubGlobal('indexedDB', idb)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('never creates a key: none stored → null', async () => {
    const { peekDeviceKey } = await import('./keystore')
    expect(await peekDeviceKey('u1')).toBeNull()
    expect(created.n).toBe(0)
    expect(idb.data.size).toBe(0)
  })

  it('returns the stored key', async () => {
    const { loadDeviceKey, peekDeviceKey } = await import('./keystore')
    const { key } = await loadDeviceKey('u1')
    expect((await peekDeviceKey('u1'))?.id).toBe(key.id)
    expect(created.n).toBe(1)
  })
})
