'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { encryptMessage } from '@/lib/e2e/crypto'
import { notifyGroupAction } from '@/features/push/server/actions'
import { DayDivider, JumpButton, jumpToMessage, UnreadDivider, useNowMinute } from '@/features/chat/components/chat-parts'
import { useFollowEnd, useReadPosition } from '@/features/chat/components/use-read-position'
import { echoMatch, failurePlan, LOCAL_ID, replySnippet, startsNewDay, type FailureKind } from '@/features/chat/essentials'
import { avatarOf, DEVICES_PER_FAN, DM_PAGE, eventLine, pickDevices, recipientsFor, type GroupEventKind } from '../schema'
import { markReadAction } from '../server/actions'
import { useDeviceKey, type EncryptedRow } from '../use-device-key'
import { Bubble, Composer, E2eNote, type ShownQuote } from './thread-parts'

type Msg = { type: 'msg'; id: string; sender_id: string; created_at: string; text: string | null; reply_to: string | null; failed?: boolean }
type Ev = { type: 'event'; id: string; kind: GroupEventKind; subject: string | null; created_at: string }
type Item = Msg | Ev
type EventRow = { id: string; kind: string; subject: string | null; created_at: string }

const COLS = 'id,sender_id,sender_device,iv,ciphertext,wrapped_keys,created_at,reply_to'
const toMsg = (m: EncryptedRow & { text: string | null }): Msg => ({
  type: 'msg',
  id: m.id,
  sender_id: m.sender_id,
  created_at: m.created_at,
  text: m.text,
  reply_to: m.reply_to ?? null,
})
const byTime = (a: Item, b: Item) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

// Group messages never pass through the app server: encrypted on this device for every device of every
// current member, written and read straight against the database with the fan's own session.
export function GroupThread({ groupId, meId, nicks: initialNicks }: { groupId: string; meId: string; nicks: Record<string, string> }) {
  // The browser Supabase client is taken inside effects and handlers, never while rendering on the server (load test
  // 2026-10-17, finding 7).
  const { key, status: keyStatus, devicesOf, reveal } = useDeviceKey(meId)
  const [items, setItems] = useState<Item[]>([])
  const [nicks, setNicks] = useState<Record<string, string>>(initialNicks)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, setPending] = useState<Msg[]>([])
  const [loaded, setLoaded] = useState(false)
  const [replyTo, setReplyTo] = useState<Msg | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const blocked = useRef(new Set<string>())
  const known = useRef(new Set(Object.keys(initialNicks)))
  const root = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState('')
  const draftRef = useRef('')
  useEffect(() => {
    draftRef.current = draft
  })
  // Server ids my sends already confirmed: their realtime echo replaces no "sending" copy.
  const confirmed = useRef(new Set<string>())
  // The message each of my pending replies answers, to put the quote back if the text is refused.
  const replyOf = useRef(new Map<string, Msg>())
  const now = useNowMinute()

  const msgs = items.filter((x): x is Msg => x.type === 'msg')
  const all: Item[] = pending.length ? [...items, ...pending] : items
  const isMine = useCallback((m: Msg) => m.sender_id === meId, [meId])
  const { divider, entered } = useReadPosition({ chat: `${meId}:grp:${groupId}`, items: msgs, ready: loaded, isMine, root, bottom, openAtEnd: true })
  const follow = useFollowEnd(all, bottom, { enabled: entered })

  // Nicknames of senders or subjects who are no longer members: one query for the missing ones.
  const learnNicks = useCallback(
    async (ids: (string | null)[]) => {
      const missing = [...new Set(ids.filter((id): id is string => !!id && !known.current.has(id)))]
      if (missing.length === 0) return
      for (const id of missing) known.current.add(id)
      const { data } = await createClient().from('profiles').select('user_id,nick').in('user_id', missing)
      if (data?.length) setNicks((cur) => ({ ...cur, ...Object.fromEntries(data.map((p) => [p.user_id, p.nick])) }))
    },
    [],
  )

  // Opening the group clears its unread counter.
  useEffect(() => {
    void markReadAction({ kind: 'group', id: groupId })
  }, [groupId])

  // History (messages + system lines, merged by time) + live messages.
  useEffect(() => {
    if (!key) return
    const supabase = createClient()
    let cancelled = false
    // My blocks first: the live channel does not know who I blocked, so it waits for this list.
    const blocksReady = supabase
      .from('blocks')
      .select('blocked_id')
      .then(({ data }) => {
        blocked.current = new Set(data?.map((b) => b.blocked_id))
      })
    void (async () => {
      const [msgs, evs] = await Promise.all([
        supabase.from('dm_group_messages').select(COLS).eq('group_id', groupId).order('created_at', { ascending: false }).limit(DM_PAGE),
        supabase.from('dm_group_events').select('id,kind,subject,created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(DM_PAGE),
        blocksReady,
      ])
      const rows = (msgs.data ?? []) as unknown as EncryptedRow[]
      // A full page of messages: show only the system lines from the same stretch of time.
      const since = rows.length === DM_PAGE ? rows[rows.length - 1]?.created_at : undefined
      const events = ((evs.data ?? []) as EventRow[]).filter((e) => !since || e.created_at >= since)
      const shown = await reveal(rows)
      void learnNicks([...rows.map((r) => r.sender_id), ...events.map((e) => e.subject)])
      if (cancelled) return
      const history: Item[] = [
        ...shown.map(toMsg),
        ...events.map((e): Item => ({ type: 'event', id: e.id, kind: e.kind as GroupEventKind, subject: e.subject, created_at: e.created_at })),
      ]
      // Keep anything that arrived live while the history was loading.
      setItems((cur) => [...history, ...cur.filter((x) => !history.some((h) => h.id === x.id))].sort(byTime))
      setLoaded(true)
    })()

    const channel = supabase.channel(`grp:${groupId}`, { config: { private: true } })
    channel.on('broadcast', { event: 'INSERT' }, async ({ payload }) => {
      const r = (payload as { record?: EncryptedRow }).record
      if (!r?.id || blocked.current.has(r.sender_id)) return // the channel does not know who I blocked
      const [m] = await reveal([r])
      // Not readable here (e.g. the sender blocked me): show it only if the database lets me read the row.
      if (m && m.text === null && r.sender_id !== meId) {
        const { data } = await supabase.from('dm_group_messages').select('id').eq('id', r.id).maybeSingle()
        if (!data) return
      }
      void learnNicks([r.sender_id])
      if (!m) return
      const s = toMsg(m)
      // My own message can arrive here before the insert returns: it replaces its "sending" copy.
      if (s.sender_id === meId) {
        setPending((cur) => {
          const i = echoMatch(cur, s, confirmed.current, (p) => p.text)
          return i < 0 ? cur : cur.filter((_, j) => j !== i)
        })
      }
      setItems((cur) => (cur.some((x) => x.id === s.id) ? cur : [...cur, s]))
      if (r.sender_id !== meId) void markReadAction({ kind: 'group', id: groupId })
    })
    void Promise.all([supabase.realtime.setAuth(), blocksReady]).then(() => {
      if (!cancelled) channel.subscribe()
    })
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [key, groupId, meId, reveal, learnNicks])

  const fail = (p: Msg, why: string, kind: FailureKind = 'retry') => {
    setStatus(why)
    const plan = failurePlan(kind)
    if (plan.keepBubble) {
      setPending((cur) => cur.map((x) => (x.id === p.id ? { ...x, failed: true } : x)))
      return
    }
    // Refused for good: no pointless retry, the text (and its quote, unless that is gone) goes back to the box.
    const quoted = replyOf.current.get(p.id)
    replyOf.current.delete(p.id)
    setPending((cur) => cur.filter((x) => x.id !== p.id))
    if (plan.restoreText && p.text !== null && !draftRef.current.trim()) {
      setDraft(p.text)
      if (plan.restoreQuote && quoted) setReplyTo((cur) => cur ?? quoted)
    }
  }

  const deliver = async (p: Msg) => {
    if (!key || p.text === null) return
    setStatus(null)
    const supabase = createClient()
    try {
      // Current members at the moment of sending: never invitees or removed fans, never fans I blocked.
      const [mem, blk] = await Promise.all([
        supabase.from('dm_group_members').select('user_id,role').eq('group_id', groupId),
        supabase.from('blocks').select('blocked_id'),
      ])
      if (mem.error || blk.error) return fail(p, 'ההודעה לא נשלחה')
      blocked.current = new Set(blk.data.map((b) => b.blocked_id))
      const ids = recipientsFor(
        mem.data.map((m) => ({ userId: m.user_id, role: m.role })),
        [...blocked.current],
        meId,
      )
      const found = await devicesOf(ids)
      // This device may not be listed yet if its key was published a moment ago.
      const withMine = found.some((d) => d.id === key.id) ? found : [...found, { user_id: meId, id: key.id, publicJwk: key.publicJwk, created_at: new Date().toISOString() }]
      const devices = pickDevices(withMine, DEVICES_PER_FAN, { user_id: meId, id: key.id })
      const enc = await encryptMessage(p.text, key, devices)
      const { data, error } = await supabase
        .from('dm_group_messages')
        .insert({ group_id: groupId, ...enc, reply_to: p.reply_to })
        .select('id,sender_id,created_at,reply_to')
        .single()
      if (error) {
        const m = error.message
        if (m.includes('not_member')) return fail(p, 'אתה כבר לא בקבוצה הזאת', 'permanent')
        if (m.includes('bad_reply')) return fail(p, 'ההודעה שענית לה כבר לא זמינה', 'bad_reply')
        return fail(p, m.includes('rate_limit') ? 'רגע, לאט יותר' : 'ההודעה לא נשלחה')
      }
      confirmed.current.add(data.id)
      replyOf.current.delete(p.id)
      setPending((cur) => cur.filter((x) => x.id !== p.id))
      setItems((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, { type: 'msg' as const, ...data, text: p.text }]))
      void notifyGroupAction({ groupId })
    } catch {
      fail(p, 'ההודעה לא נשלחה')
    }
  }

  const send = async (text: string) => {
    if (!key) return false
    const p: Msg = { type: 'msg', id: `${LOCAL_ID}${crypto.randomUUID()}`, sender_id: meId, created_at: new Date().toISOString(), text, reply_to: replyTo?.id ?? null }
    if (replyTo) replyOf.current.set(p.id, replyTo)
    follow.followNext()
    setPending((cur) => [...cur, p])
    setReplyTo(null)
    void deliver(p)
    return true
  }

  const shownStatus = status ?? keyStatus
  const nickOf = (id: string | null) => (id && nicks[id]) || 'אוהד'
  const jump = useCallback((id: string) => jumpToMessage(root.current, id), [])
  const byId = new Map(msgs.map((m) => [m.id, m]))
  const quoteOf = (m: Msg): ShownQuote | null => {
    if (!m.reply_to) return null
    const orig = byId.get(m.reply_to)
    if (!orig) return { nick: 'הודעה קודמת', text: '' }
    return {
      nick: orig.sender_id === meId ? 'אתה' : nickOf(orig.sender_id),
      text: orig.text === null ? 'הודעה מוצפנת' : replySnippet(orig.text),
      to: orig.id,
    }
  }

  const rows: ReactNode[] = []
  let prevAt: string | undefined
  for (const it of all) {
    if (startsNewDay(prevAt, it.created_at)) rows.push(<DayDivider key={`day-${it.id}`} at={it.created_at} now={now} />)
    prevAt = it.created_at
    if (it.type === 'event') {
      rows.push(
        <li key={it.id} className="self-center rounded-full bg-surface px-3 py-1 text-xs text-muted">
          {eventLine(it.kind, nickOf(it.subject))}
        </li>,
      )
      continue
    }
    if (divider?.id === it.id) rows.push(<UnreadDivider key="unread" label={divider.label} />)
    const m = it
    rows.push(
      <Bubble
        key={m.id}
        id={m.id}
        mine={m.sender_id === meId}
        text={m.text}
        createdAt={m.created_at}
        sender={m.sender_id === meId ? undefined : { nick: nickOf(m.sender_id), hue: avatarOf(m.sender_id, '').hue }}
        failed={m.failed}
        quote={quoteOf(m)}
        onJump={jump}
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
        onDiscard={() => {
          replyOf.current.delete(m.id)
          setPending((cur) => cur.filter((x) => x.id !== m.id))
        }}
      />,
    )
  }

  return (
    <div
      ref={root}
      className="chat-doodle flex min-h-[65dvh] flex-col"
      // Escape anywhere in the chat (box, reply bar, message actions) cancels a reply and closes the actions.
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || (!replyTo && !active)) return
        e.preventDefault()
        setActive(null)
        if (replyTo) {
          setReplyTo(null)
          input.current?.focus()
        }
      }}
    >
      <E2eNote />
      <span className="sr-only" aria-live="polite">
        {divider?.label ?? ''}
      </span>
      <ol className="flex flex-1 flex-col gap-2" aria-label="הודעות">
        {all.length === 0 && <li className="py-10 text-center text-muted">עוד אין הודעות. כתוב ראשון</li>}
        {rows}
        <div ref={bottom} className="scroll-mb-48" />
      </ol>
      <Composer
        ready={!!key}
        placeholder="הודעה לקבוצה…"
        label="הודעה לקבוצה"
        onSend={send}
        draft={draft}
        onDraft={setDraft}
        inputRef={input}
        reply={replyTo ? { nick: replyTo.sender_id === meId ? 'עצמך' : nickOf(replyTo.sender_id), text: replyTo.text === null ? 'הודעה מוצפנת' : replySnippet(replyTo.text) } : null}
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
