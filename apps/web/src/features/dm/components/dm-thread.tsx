'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { encryptMessage, safetyCode } from '@/lib/e2e/crypto'
import { notifyDmAction } from '@/features/push/server/actions'
import { DayDivider, JumpButton, jumpToMessage, UnreadDivider, useNowMinute } from '@/features/chat/components/chat-parts'
import { useFollowEnd, useReadPosition } from '@/features/chat/components/use-read-position'
import { LOCAL_ID, replySnippet, startsNewDay } from '@/features/chat/essentials'
import { DM_PAGE } from '../schema'
import { markReadAction } from '../server/actions'
import { useDeviceKey, type EncryptedRow } from '../use-device-key'
import { Bubble, Composer, E2eNote, type ShownQuote } from './thread-parts'

type Shown = { id: string; sender_id: string; created_at: string; text: string | null; reply_to: string | null; failed?: boolean }

const COLS = 'id,sender_id,sender_device,iv,ciphertext,wrapped_keys,created_at,reply_to'

const shown = (m: EncryptedRow & { text: string | null }): Shown => ({
  id: m.id,
  sender_id: m.sender_id,
  created_at: m.created_at,
  text: m.text,
  reply_to: m.reply_to ?? null,
})

// Private messages never pass through the app server: this component encrypts, writes and reads
// straight against the database with the fan's own session. The server stores ciphertext only (a reply adds the id of
// the answered message; its text is found and decrypted here, on the device).
export function DmThread({ threadId, meId, otherId, otherNick }: { threadId: string; meId: string; otherId: string; otherNick: string }) {
  const [supabase] = useState(() => createClient())
  const { key, status: keyStatus, devicesOf, reveal } = useDeviceKey(meId)
  const [messages, setMessages] = useState<Shown[]>([])
  const [pending, setPending] = useState<Shown[]>([])
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Shown | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const now = useNowMinute()

  const all = pending.length ? [...messages, ...pending] : messages
  const isMine = useCallback((m: Shown) => m.sender_id === meId, [meId])
  const { divider, entered } = useReadPosition({ chat: `${meId}:dm:${threadId}`, items: messages, ready: loaded, isMine, root, bottom, openAtEnd: true })
  const follow = useFollowEnd(all, bottom, { enabled: entered })

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
        const rows = await reveal(((data ?? []) as unknown as EncryptedRow[]).reverse())
        if (cancelled) return
        const history = rows.map(shown)
        // Keep anything that arrived live while the history was loading.
        setMessages((cur) => [...history, ...cur.filter((x) => !history.some((h) => h.id === x.id))])
        setLoaded(true)
      })
    const channel = supabase.channel(`dm:${threadId}`, { config: { private: true } })
    channel.on('broadcast', { event: 'INSERT' }, async ({ payload }) => {
      const r = (payload as { record?: EncryptedRow }).record
      if (!r?.id) return
      const [m] = await reveal([r])
      if (!m) return
      const s = shown(m)
      // My own message can arrive here before the insert returns: it replaces its "sending" copy.
      if (s.sender_id === meId) {
        setPending((cur) => {
          const i = cur.findIndex((p) => !p.failed && p.text === s.text && p.reply_to === s.reply_to)
          return i < 0 ? cur : cur.filter((_, j) => j !== i)
        })
      }
      setMessages((cur) => (cur.some((x) => x.id === s.id) ? cur : [...cur, s]))
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

  const fail = (p: Shown, why: string) => {
    setPending((cur) => cur.map((x) => (x.id === p.id ? { ...x, failed: true } : x)))
    setStatus(why)
  }

  const deliver = async (p: Shown) => {
    if (!key || p.text === null) return
    setStatus(null)
    try {
      const devices = await devicesOf([meId, otherId])
      if (!devices.some((d) => d.user_id === otherId)) {
        return fail(p, `${otherNick} עוד לא פתח את ההודעות הפרטיות במכשיר שלו. אפשר לשלוח אחרי שייכנס.`)
      }
      const enc = await encryptMessage(p.text, key, devices)
      // Every key of the other fan may be unusable (skipped): then nobody but me could read it.
      if (!devices.some((d) => d.user_id === otherId && enc.wrapped_keys[d.id])) {
        return fail(p, 'ההודעה לא נשלחה')
      }
      const { data, error } = await supabase
        .from('dm_messages')
        .insert({ thread_id: threadId, ...enc, reply_to: p.reply_to })
        .select('id,sender_id,created_at,reply_to')
        .single()
      if (error) {
        const m = error.message
        return fail(p, m.includes('blocked') ? 'אי אפשר לשלוח לאוהד הזה' : m.includes('rate_limit') ? 'רגע, לאט יותר' : m.includes('bad_reply') ? 'ההודעה שענית לה כבר לא זמינה' : 'ההודעה לא נשלחה')
      }
      setPending((cur) => cur.filter((x) => x.id !== p.id))
      setMessages((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, { ...data, text: p.text }]))
      void notifyDmAction({ threadId })
    } catch {
      fail(p, 'ההודעה לא נשלחה')
    }
  }

  const send = async (text: string) => {
    if (!key) return false
    const p: Shown = { id: `${LOCAL_ID}${crypto.randomUUID()}`, sender_id: meId, created_at: new Date().toISOString(), text, reply_to: replyTo?.id ?? null }
    follow.followNext()
    setPending((cur) => [...cur, p])
    setReplyTo(null)
    void deliver(p)
    return true
  }

  const jump = useCallback((id: string) => jumpToMessage(root.current, id), [])
  const byId = new Map(messages.map((m) => [m.id, m]))
  const nickOf = (id: string) => (id === meId ? 'אתה' : otherNick)
  const quoteOf = (m: Shown): ShownQuote | null => {
    if (!m.reply_to) return null
    const orig = byId.get(m.reply_to)
    if (!orig) return { nick: 'הודעה קודמת', text: '' }
    const to = orig.id
    return { nick: nickOf(orig.sender_id), text: orig.text === null ? 'הודעה מוצפנת' : replySnippet(orig.text), onJump: () => jump(to) }
  }

  const rows: ReactNode[] = []
  let prevAt: string | undefined
  for (const m of all) {
    if (startsNewDay(prevAt, m.created_at)) rows.push(<DayDivider key={`day-${m.id}`} at={m.created_at} now={now} />)
    prevAt = m.created_at
    if (divider?.id === m.id) rows.push(<UnreadDivider key="unread" label={divider.label} />)
    rows.push(
      <Bubble
        key={m.id}
        id={m.id}
        mine={m.sender_id === meId}
        text={m.text}
        createdAt={m.created_at}
        locked="נשלח למכשיר אחר שלך"
        failed={m.failed}
        quote={quoteOf(m)}
        active={active === m.id}
        onActive={setActive}
        onReply={() => {
          setReplyTo(m)
          input.current?.focus()
        }}
        onRetry={() => {
          setPending((cur) => cur.map((x) => (x.id === m.id ? { ...x, failed: false } : x)))
          void deliver({ ...m, failed: false })
        }}
        onDiscard={() => setPending((cur) => cur.filter((x) => x.id !== m.id))}
      />,
    )
  }

  const shownStatus = status ?? keyStatus

  return (
    <div ref={root} className="chat-doodle flex min-h-[65dvh] flex-col">
      <E2eNote>
        <button
          type="button"
          className="ms-auto flex min-h-11 items-center gap-1 text-accent-text"
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
      <span className="sr-only" aria-live="polite">
        {divider?.label ?? ''}
      </span>

      <ol className="flex flex-1 flex-col gap-2" aria-label="הודעות">
        {all.length === 0 && <li className="py-10 text-center text-muted">התחל שיחה עם {otherNick}</li>}
        {rows}
        <div ref={bottom} className="scroll-mb-48" />
      </ol>

      <Composer
        ready={!!key}
        placeholder="הודעה פרטית…"
        label="הודעה פרטית"
        onSend={send}
        inputRef={input}
        reply={replyTo ? { nick: nickOf(replyTo.sender_id) === 'אתה' ? 'עצמך' : otherNick, text: replyTo.text === null ? 'הודעה מוצפנת' : replySnippet(replyTo.text) } : null}
        onCancelReply={() => {
          setReplyTo(null)
          input.current?.focus()
        }}
        above={!follow.atBottom ? <JumpButton count={follow.unread} onClick={follow.toEnd} /> : null}
      />
      {shownStatus && (
        <p role="alert" className="mt-2 text-sm text-live">
          {shownStatus}
        </p>
      )}
    </div>
  )
}
