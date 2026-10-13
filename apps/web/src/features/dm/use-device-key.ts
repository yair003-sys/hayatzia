'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { decryptMessage, type DeviceKey, type EncryptedMessage, type PublicDevice } from '@/lib/e2e/crypto'
import { e2eSupported, loadDeviceKey } from '@/lib/e2e/keystore'

export type EncryptedRow = EncryptedMessage & { id: string; sender_id: string; created_at: string }

/**
 * This device's key for the signed-in fan (loaded or created, public half published) plus the two
 * things every encrypted screen needs: the public keys of a set of fans, and decrypting rows on the device.
 * Plaintext never leaves the browser.
 */
export function useDeviceKey(meId: string) {
  const [supabase] = useState(() => createClient())
  const [key, setKey] = useState<DeviceKey | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const pubs = useRef(new Map<string, string>()) // `${user}/${device}` → public JWK

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!e2eSupported()) {
        setStatus('הדפדפן הזה לא תומך בהצפנה. נסה דפדפן מעודכן.')
        return
      }
      const loaded = await loadDeviceKey(meId).catch((e: unknown) => {
        console.warn('device key', e)
        return null
      })
      if (!loaded) {
        if (!cancelled) setStatus('לא הצלחנו לפתוח את ההצפנה במכשיר הזה')
        return
      }
      const k = loaded.key
      const { error } = await supabase.from('device_keys').insert({ device_id: k.id, public_jwk: k.publicJwk })
      if (error && error.code !== '23505') console.warn('device key', error.message)
      if (!cancelled) setKey(k)
    })()
    return () => {
      cancelled = true
    }
  }, [meId, supabase])

  const devicesOf = useCallback(
    async (userIds: string[]): Promise<(PublicDevice & { user_id: string; created_at: string })[]> => {
      if (userIds.length === 0) return []
      const { data } = await supabase.from('device_keys').select('user_id,device_id,public_jwk,created_at').in('user_id', userIds)
      return (data ?? []).map((d) => {
        pubs.current.set(`${d.user_id}/${d.device_id}`, d.public_jwk)
        return { user_id: d.user_id, id: d.device_id, publicJwk: d.public_jwk, created_at: d.created_at }
      })
    },
    [supabase],
  )

  /** Decrypts rows with this device's key; `text` is null when this device cannot read a row. */
  const reveal = useCallback(
    async <T extends EncryptedRow>(rows: T[]): Promise<(T & { text: string | null })[]> => {
      if (!key) return rows.map((r) => ({ ...r, text: null }))
      const missing = [...new Set(rows.filter((r) => !pubs.current.has(`${r.sender_id}/${r.sender_device}`)).map((r) => r.sender_id))]
      if (missing.length > 0) await devicesOf(missing)
      return Promise.all(
        rows.map(async (r) => {
          const pub = pubs.current.get(`${r.sender_id}/${r.sender_device}`)
          let text: string | null = null
          try {
            text = pub ? await decryptMessage(r, key, pub) : null
          } catch {
            text = null // written before this device existed, or for another device only
          }
          return { ...r, text }
        }),
      )
    },
    [key, devicesOf],
  )

  return { key, status, devicesOf, reveal }
}
