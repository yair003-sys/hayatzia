'use client'

// This device's key pair, kept in IndexedDB per signed-in fan. The private CryptoKey is non-extractable:
// IndexedDB stores it as an opaque handle that can be used but never read out.
import { createDeviceKey, type DeviceKey } from './crypto'

const DB = 'hy-keys'
const STORE = 'k'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB, 1)
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE)
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror = () => reject(rq.error)
  })
}

function get<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    const rq = db.transaction(STORE).objectStore(STORE).get(key)
    rq.onsuccess = () => resolve((rq.result as T) ?? null)
    rq.onerror = () => resolve(null)
  })
}

function put(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function e2eSupported(): boolean {
  return typeof window !== 'undefined' && !!window.crypto?.subtle && !!window.indexedDB
}

/** Loads this device's key for the fan, creating it on first use. */
export async function loadDeviceKey(userId: string): Promise<{ key: DeviceKey; created: boolean }> {
  const db = await open()
  const rec = await get<{ id: string; priv: CryptoKey; pub: string }>(db, `dev_${userId}`)
  if (rec?.priv) return { key: { id: rec.id, privateKey: rec.priv, publicJwk: rec.pub }, created: false }
  const key = await createDeviceKey()
  await put(db, `dev_${userId}`, { id: key.id, priv: key.privateKey, pub: key.publicJwk })
  return { key, created: true }
}
