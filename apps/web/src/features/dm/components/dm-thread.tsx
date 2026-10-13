'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { encryptMessage, safetyCode } from '@/lib/e2e/crypto'
import { notifyDmAction } from '@/features/push/server/actions'
import { DM_PAGE } from '../schema'
import { markReadAction } from '../server/actions'
import { useDeviceKey, type EncryptedRow } from '../use-device-key'
import { Bubble, Composer, E2eNote } from './thread-parts'

type Shown = { id: string; sender_id: string; created_at: string; text: string | null }

const COLS = 'id,sender_id,sender_device,iv,ciphertext,wrapped_keys,created_at'

// Private messages never pass through the app server: this component encrypts, writes and reads
// straight against the database with the fan's own session. The server stores ciphertext only.
export function DmThread({ threadId, meId, otherId, otherNick }: { threadId: string; meId: string; otherId: string; otherNick: string }) {
  const [supabase] = useState(() => createClient())
  const { key, status: keyStatus, devicesOf, reveal } = useDeviceKey(meId)
  const [messages, setMessages] = useState<Shown[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [sending, start] = useTransition()
  const bottom = useRef<HTMLDivElement>(null)

  // Opening the chat clears its unread counter.
  useEffect(() => {
    void markReadAction({ kind: 'dm', id: threadId })
  }, [threadId])

  // History + live.
  useEffect(() => {
    if (!key) return
    let cancelled = false
    void supabase
      .from('dm_messages')
      .select(COLS)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(DM_PAGE)
      .then(async ({ data }) => {
        const shown = await reveal(((data ?? []) as unknown as EncryptedRow[]).reverse())
        if (!cancelled) setMessages(shown)
      })
    const channel = supabase.channel(`dm:${threadId}`, { config: { private: true } })
    channel.on('broadcast', { event: 'INSERT' }, async ({ payload }) => {
      const r = (payload as { record?: EncryptedRow }).record
      if (!r?.id) return
      const [m] = await reveal([r])
      if (m) setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]))
      if (r.sender_id !== meId) void markReadAction({ kind: 'dm', id: threadId })
    })
    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe()
    })
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [key, threadId, meId, supabase, reveal])

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [messages])

  const send = (text: string) =>
    new Promise<boolean>((resolve) => {
      if (!key) return resolve(false)
      start(async () => {
        setStatus(null)
        const devices = await devicesOf([meId, otherId])
        if (!devices.some((d) => d.user_id === otherId)) {
          setStatus(`${otherNick} עוד לא פתח את ההודעות הפרטיות במכשיר שלו. אפשר לשלוח אחרי שייכנס.`)
          return resolve(false)
        }
        const enc = await encryptMessage(text, key, devices)
        const { data, error } = await supabase.from('dm_messages').insert({ thread_id: threadId, ...enc }).select('id,sender_id,created_at').single()
        if (error) {
          setStatus(error.message.includes('blocked') ? 'אי אפשר לשלוח לאוהד הזה' : error.message.includes('rate_limit') ? 'רגע, לאט יותר' : 'ההודעה לא נשלחה')
          return resolve(false)
        }
        setMessages((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, { ...data, text }]))
        void notifyDmAction({ threadId })
        resolve(true)
      })
    })

  const shownStatus = status ?? keyStatus

  return (
    <div className="flex min-h-[65dvh] flex-col">
      <E2eNote>
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
      </E2eNote>
      {code && (
        <div className="mb-3 space-y-1 rounded-lg border border-line bg-surface-2 p-3 text-center">
          <p dir="ltr" className="text-2xl t-num tracking-widest">
            {code}
          </p>
          <p className="text-xs text-muted">השוו עם {otherNick} (פנים אל פנים או בטלפון). אם הקוד זהה, אף אחד לא מתחזה באמצע.</p>
        </div>
      )}

      <ol className="flex flex-1 flex-col gap-2" aria-label="הודעות">
        {messages.length === 0 && <li className="py-10 text-center text-muted">התחל שיחה עם {otherNick}</li>}
        {messages.map((m) => (
          <Bubble key={m.id} mine={m.sender_id === meId} text={m.text} createdAt={m.created_at} locked="נשלח למכשיר אחר שלך" />
        ))}
        <div ref={bottom} />
      </ol>

      <Composer ready={!!key} sending={sending} placeholder="הודעה פרטית…" label="הודעה פרטית" onSend={send} />
      {shownStatus && (
        <p role="alert" className="mt-2 text-sm text-live">
          {shownStatus}
        </p>
      )}
    </div>
  )
}
