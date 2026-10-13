'use client'

import { memo, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { ArrowDown, SendHorizontal } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { openChannel } from '@/lib/supabase/channel'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  chatTime,
  countAfter,
  hasNewTail,
  MESSAGE_MAX,
  mergeMessages,
  messageFromBroadcast,
  PAGE_SIZE,
  type ChatMessage,
  type Cursor,
  type SendResult,
} from '../schema'

export type ChatRoomProps = {
  /** Private realtime channel, e.g. "team:mta" or "match:1360230" (authorised by RLS on realtime.messages). */
  topic: string
  meId: string
  initial: ChatMessage[]
  send: (body: string) => Promise<SendResult>
  loadOlder: (cursor: Cursor) => Promise<ChatMessage[]>
  /** When set, the composer is replaced by this note (room closed, read-only fan…). */
  readOnly?: ReactNode
  placeholder?: string
  emptyText?: string
  /** Optional colour for the nickname / bubble edge of other fans' messages (e.g. by side in a match room). */
  tint?: (m: ChatMessage) => string | undefined
  /** Fans the viewer blocked: their messages are not shown. */
  hiddenUsers?: string[]
  /** Extra items shown in the stream by time (e.g. crowd-verdict polls), `at` = ISO time. */
  inserts?: { key: string; at: string; node: ReactNode }[]
  /** Other broadcast events on the same channel (e.g. 'poll', 'tally', 'poll_closed'). */
  onChannelEvent?: (event: string, payload: unknown) => void
  /** Shown just above the composer (e.g. the open poll's jump button). */
  pinned?: ReactNode
}

const EXTRA_EVENTS = ['poll', 'tally', 'poll_closed'] as const

export function ChatRoom({
  topic,
  meId,
  initial,
  send,
  loadOlder,
  readOnly,
  placeholder,
  emptyText,
  tint,
  hiddenUsers,
  inserts,
  onChannelEvent,
  pinned,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial)
  const [hasOlder, setHasOlder] = useState(initial.length >= PAGE_SIZE)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [sending, startSend] = useTransition()
  const [loadingOlder, startOlder] = useTransition()
  const bottom = useRef<HTMLDivElement>(null)
  const shown = useRef<ChatMessage[]>(initial)
  const shownInserts = useRef(inserts?.length ?? 0)
  // Whether the end of the conversation is on screen; the chat follows new messages only then.
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)
  const [seenId, setSeenId] = useState<string | null>(initial.at(-1)?.id ?? null)
  const followMine = useRef(false)

  useEffect(() => {
    const el = bottom.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        const v = e?.isIntersecting ?? true
        atBottomRef.current = v
        setAtBottom(v)
      },
      { rootMargin: '0px 0px 160px 0px' },
    )
    io.observe(el)
    // Open at the newest message, like any chat.
    el.scrollIntoView({ block: 'end' })
    return () => io.disconnect()
  }, [])
  const onExtra = useRef(onChannelEvent)
  useEffect(() => {
    onExtra.current = onChannelEvent
  }, [onChannelEvent])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    let channel: RealtimeChannel | null = null
    void (async () => {
      const ch = await openChannel(supabase, topic, { private: true })
      if (cancelled) return void supabase.removeChannel(ch)
      channel = ch
      ch.on('broadcast', { event: 'INSERT' }, ({ payload }) => {
        const m = messageFromBroadcast(payload)
        if (m) setMessages((cur) => mergeMessages(cur, [m]))
      })
      for (const ev of EXTRA_EVENTS) {
        ch.on('broadcast', { event: ev }, ({ payload }) => onExtra.current?.(ev, payload))
      }
      await supabase.realtime.setAuth()
      if (!cancelled) ch.subscribe((status) => setLive(status === 'SUBSCRIBED'))
    })()
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [topic])

  // Follow the conversation only when the fan is already at the end (or just sent a message);
  // someone reading further up stays where they are and gets the "jump to the end" button instead.
  useEffect(() => {
    const grew = (inserts?.length ?? 0) > shownInserts.current
    const newTail = hasNewTail(shown.current, messages)
    if ((newTail || grew) && (atBottomRef.current || followMine.current)) {
      bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
    followMine.current = false
    shown.current = messages
    shownInserts.current = inserts?.length ?? 0
  }, [messages, inserts?.length])

  // What the fan has seen: everything up to the last message while at the end.
  const last = messages.at(-1)?.id ?? null
  useEffect(() => {
    if (!atBottom || !last) return
    const t = setTimeout(() => setSeenId(last), 0)
    return () => clearTimeout(t)
  }, [atBottom, last])
  const unread = atBottom ? 0 : countAfter(messages, seenId)
  const toEnd = () => bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })

  const submit = () => {
    const body = draft.trim()
    if (!body || sending) return
    startSend(async () => {
      const res = await send(body)
      if ('message' in res) {
        followMine.current = true
        setMessages((cur) => mergeMessages(cur, [res.message]))
        setDraft('')
        setError(null)
      } else {
        setError(res.error)
      }
    })
  }

  const first = messages[0]

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted" aria-live="polite">
        <span className={cn('size-2 rounded-full', live ? 'bg-ok' : 'bg-dim')} aria-hidden="true" />
        {live ? 'מחובר בזמן אמת' : 'מתחבר…'}
      </div>

      <ol className="flex flex-1 flex-col gap-2" aria-label="הודעות">
        {hasOlder && first && (
          <li className="self-center">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={() =>
                startOlder(async () => {
                  const older = await loadOlder({ createdAt: first.created_at, id: first.id })
                  setMessages((cur) => mergeMessages(cur, older))
                  setHasOlder(older.length >= PAGE_SIZE)
                })
              }
              className="rounded-full border border-line px-3 py-1 text-xs text-muted disabled:opacity-50"
            >
              {loadingOlder ? 'טוען…' : 'הודעות קודמות'}
            </button>
          </li>
        )}
        {messages.length === 0 && <li className="py-10 text-center text-muted">{emptyText ?? 'עוד אין הודעות.'}</li>}
        {stream(messages.filter((m) => !hiddenUsers?.includes(m.user_id)), inserts).map((item) => {
          if (item.kind === 'x') return <li key={item.key} className="flex flex-col self-stretch">{item.node}</li>
          return <MessageItem key={item.m.id} m={item.m} mine={item.m.user_id === meId} color={item.m.user_id === meId ? undefined : tint?.(item.m)} />
        })}
        <div ref={bottom} className="scroll-mb-48" />
      </ol>

      <div className="sticky bottom-[calc(var(--tabbar-space)+0.75rem)] z-10 mt-4 grid gap-2">
      {!atBottom && (
        <button
          type="button"
          onClick={toEnd}
          className="flex min-h-10 items-center gap-1.5 justify-self-center rounded-full border border-line bg-surface-3/95 px-3.5 text-xs font-bold shadow-[0_3px_0_var(--color-elev),0_10px_20px_-10px_rgb(0_0_0/.9)] backdrop-blur transition-transform active:translate-y-0.5"
        >
          <ArrowDown className="size-4" aria-hidden="true" />
          {unread > 0 ? `${unread} הודעות חדשות` : 'לסוף הצ׳אט'}
        </button>
      )}
      {pinned}
      {readOnly ? (
        <p className="rounded-xl border border-line bg-elev/95 p-3 text-center text-sm text-muted backdrop-blur">
          {readOnly}
        </p>
      ) : (
        <form
          className="flex items-end gap-2 rounded-xl border border-line bg-elev/95 p-2 backdrop-blur"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label className="sr-only" htmlFor={`chat-input-${topic}`}>
            הודעה
          </label>
          <textarea
            id={`chat-input-${topic}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            maxLength={MESSAGE_MAX}
            rows={1}
            placeholder={placeholder ?? 'כתוב הודעה…'}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 outline-none"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="שלח"
            className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-white disabled:opacity-40"
          >
            <SendHorizontal className="size-5 -scale-x-100" aria-hidden="true" />
          </button>
        </form>
      )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-live">
          {error}
        </p>
      )}
    </div>
  )
}

type StreamItem = { kind: 'm'; at: string; m: ChatMessage } | { kind: 'x'; at: string; key: string; node: ReactNode }

/** Messages and extra items merged by time (stable: messages first on equal times). */
function stream(messages: ChatMessage[], inserts: ChatRoomProps['inserts']): StreamItem[] {
  const items: StreamItem[] = messages.map((m) => ({ kind: 'm', at: m.created_at, m }))
  if (!inserts?.length) return items
  for (const x of inserts) items.push({ kind: 'x', at: x.at, key: x.key, node: x.node })
  return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

/** One message bubble; memoised so a ticking poll countdown does not re-render the whole conversation. */
const MessageItem = memo(function MessageItem({ m, mine, color }: { m: ChatMessage; mine: boolean; color?: string }) {
  return (
            <li className={cn('flex max-w-[85%] flex-col', mine ? 'self-start' : 'self-end')}>
              {!mine && (
                <span className="mb-0.5 px-1 text-xs font-semibold text-accent-text" style={color ? { color } : undefined}>
                  {m.nick}
                </span>
              )}
              <div
                className={cn(
                  'rounded-lg px-3 py-2 break-words whitespace-pre-wrap',
                  mine ? 'bg-accent text-white' : 'border border-line-soft bg-surface-2',
                )}
                style={color ? { borderInlineStartColor: color, borderInlineStartWidth: 3 } : undefined}
              >
                {m.body}
              </div>
              <time dateTime={m.created_at} className="mt-0.5 px-1 text-[11px] text-dim">
                {chatTime(m.created_at)}
              </time>
            </li>
  )
})
