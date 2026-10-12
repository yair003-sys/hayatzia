'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Lock, SendHorizontal, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { decryptMessage, encryptMessage, safetyCode, type DeviceKey, type EncryptedMessage, type PublicDevice } from '@/lib/e2e/crypto'
import { e2eSupported, loadDeviceKey } from '@/lib/e2e/keystore'
import { chatTime } from '@/features/chat/schema'
import { cn } from '@/lib/utils'
import { notifyDmAction } from '@/features/push/server/actions'
import { DM_MAX, DM_PAGE } from '../schema'

type Row = EncryptedMessage & { id: string; sender_id: string; created_at: string }
type Shown = { id: string; sender_id: string; created_at: string; text: string | null }

// Private messages never pass through the app server: this component encrypts, writes and reads
// straight against the database with the fan's own session. The server stores ciphertext only.
export function DmThread({ threadId, meId, otherId, otherNick }: { threadId: string; meId: string; otherId: string; otherNick: string }) {
  const [supabase] = useState(() => createClient())
  const [me, setMe] = useState<DeviceKey | null>(null)
  const [messages, setMessages] = useState<Shown[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [sending, start] = useTransition()
  const pubs = useRef(new Map<string, string>()) // `${user}/${device}` → public JWK
  const bottom = useRef<HTMLDivElement>(null)

  const devicesOf = useCallback(
    async (userIds: string[]): Promise<(PublicDevice & { user_id: string })[]> => {
      const { data } = await supabase.from('device_keys').select('user_id,device_id,public_jwk').in('user_id', userIds)
      return (data ?? []).map((d) => {
        pubs.current.set(`${d.user_id}/${d.device_id}`, d.public_jwk)
        return { user_id: d.user_id, id: d.device_id, publicJwk: d.public_jwk }
      })
    },
    [supabase],
  )

  const reveal = useCallback(
    async (rows: Row[], key: DeviceKey): Promise<Shown[]> => {
      const missing = rows.some((r) => !pubs.current.has(`${r.sender_id}/${r.sender_device}`))
      if (missing) await devicesOf([meId, otherId])
      return Promise.all(
        rows.map(async (r) => {
          const pub = pubs.current.get(`${r.sender_id}/${r.sender_device}`)
          let text: string | null = null
          try {
            text = pub ? await decryptMessage(r, key, pub) : null
          } catch {
            text = null // written before this device existed, or for another device only
          }
          return { id: r.id, sender_id: r.sender_id, created_at: r.created_at, text }
        }),
      )
    },
    [devicesOf, meId, otherId],
  )

  // Device key: load or create, publish the public half.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!e2eSupported()) {
        setStatus('הדפדפן הזה לא תומך בהצפנה. נסה דפדפן מעודכן.')
        return
      }
      const { key } = await loadDeviceKey(meId)
      const { error } = await supabase.from('device_keys').insert({ device_id: key.id, public_jwk: key.publicJwk })
      if (error && error.code !== '23505') console.warn('device key', error.message)
      if (!cancelled) setMe(key)
    })()
    return () => {
      cancelled = true
    }
  }, [meId, supabase])

  // History + live.
  useEffect(() => {
    if (!me) return
    let cancelled = false
    const cols = 'id,sender_id,sender_device,iv,ciphertext,wrapped_keys,created_at'
    void supabase
      .from('dm_messages')
      .select(cols)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(DM_PAGE)
      .then(async ({ data }) => {
        const shown = await reveal(((data ?? []) as unknown as Row[]).reverse(), me)
        if (!cancelled) setMessages(shown)
      })
    const channel = supabase.channel(`dm:${threadId}`, { config: { private: true } })
    channel.on('broadcast', { event: 'INSERT' }, async ({ payload }) => {
      const r = (payload as { record?: Row }).record
      if (!r?.id) return
      const [m] = await reveal([r], me)
      if (m) setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]))
    })
    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe()
    })
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [me, threadId, supabase, reveal])

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [messages])

  const send = () => {
    const text = draft.trim()
    if (!text || !me) return
    start(async () => {
      setStatus(null)
      const devices = await devicesOf([meId, otherId])
      if (!devices.some((d) => d.user_id === otherId)) {
        setStatus(`${otherNick} עוד לא פתח את ההודעות הפרטיות במכשיר שלו. אפשר לשלוח אחרי שייכנס.`)
        return
      }
      const enc = await encryptMessage(text, me, devices)
      const { data, error } = await supabase
        .from('dm_messages')
        .insert({ thread_id: threadId, ...enc })
        .select('id,sender_id,created_at')
        .single()
      if (error) {
        setStatus(error.message.includes('blocked') ? 'אי אפשר לשלוח לאוהד הזה' : error.message.includes('rate_limit') ? 'לאט לאט 🙂' : 'ההודעה לא נשלחה')
        return
      }
      setDraft('')
      setMessages((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, { ...data, text }]))
      void notifyDmAction({ threadId })
    })
  }

  return (
    <div className="flex min-h-[65dvh] flex-col">
      <div className="mb-3 flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-xs text-muted">
        <Lock className="size-3.5 text-ok" aria-hidden="true" />
        מוצפן מקצה לקצה. גם אנחנו לא יכולים לקרוא.
        <button
          type="button"
          className="ms-auto flex items-center gap-1 text-accent-text"
          onClick={async () => {
            const devs = await devicesOf([meId, otherId])
            setCode(await safetyCode(devs.map((d) => d.publicJwk)))
          }}
        >
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          קוד אימות
        </button>
      </div>
      {code && (
        <div className="mb-3 space-y-1 rounded-lg border border-line bg-surface-2 p-3 text-center">
          <p dir="ltr" className="font-display text-2xl font-black tracking-widest">
            {code}
          </p>
          <p className="text-xs text-muted">השוו עם {otherNick} (פנים אל פנים או בטלפון). אם הקוד זהה, אף אחד לא מתחזה באמצע.</p>
        </div>
      )}

      <ol className="flex flex-1 flex-col gap-2" aria-label="הודעות">
        {messages.length === 0 && <li className="py-10 text-center text-muted">תתחיל שיחה עם {otherNick} 👋</li>}
        {messages.map((m) => {
          const mine = m.sender_id === meId
          return (
            <li key={m.id} className={cn('flex max-w-[85%] flex-col', mine ? 'self-start' : 'self-end')}>
              <div className={cn('rounded-lg px-3 py-2 break-words whitespace-pre-wrap', mine ? 'bg-accent text-white' : 'border border-line-soft bg-surface-2')}>
                {m.text ?? <span className="text-xs italic opacity-70">🔒 נשלח למכשיר אחר שלך</span>}
              </div>
              <time dateTime={m.created_at} className="mt-0.5 px-1 text-[11px] text-dim">
                {chatTime(m.created_at)}
              </time>
            </li>
          )
        })}
        <div ref={bottom} />
      </ol>

      <form
        className="sticky bottom-24 mt-4 flex items-end gap-2 rounded-xl border border-line bg-elev/95 p-2 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <label htmlFor="dm-input" className="sr-only">
          הודעה פרטית
        </label>
        <textarea
          id="dm-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          maxLength={DM_MAX}
          rows={1}
          disabled={!me}
          placeholder={me ? 'הודעה פרטית…' : 'מכין הצפנה…'}
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 outline-none"
        />
        <button type="submit" disabled={sending || !me || !draft.trim()} aria-label="שלח" className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-white disabled:opacity-40">
          <SendHorizontal className="size-5 -scale-x-100" aria-hidden="true" />
        </button>
      </form>
      {status && (
        <p role="alert" className="mt-2 text-sm text-live">
          {status}
        </p>
      )}
    </div>
  )
}
