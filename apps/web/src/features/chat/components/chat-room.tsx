'use client'

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Flag, SendHorizontal, X } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { openChannel } from '@/lib/supabase/channel'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { TypingLine } from './typing-line'
import { useTyping } from './use-typing'
import { DayDivider, JumpButton, jumpToMessage, MessageAuthor, MessageMeta, MessageRow, Quote, ReplyBar, UnreadDivider, useNowMinute } from './chat-parts'
import { FanSheet, type SheetFan } from './fan-sheet'
import { useFollowEnd, useReadPosition } from './use-read-position'
import { ReportForm } from '@/features/safety/components/report-block'
import { canReport, echoMatch, failurePlan, LOCAL_ID, replySnippet, sendState, startsNewDay } from '../essentials'
import {
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
  /** Sends a message (optionally a reply to `replyTo`, a message of the same chat). */
  send: (body: string, replyTo?: string) => Promise<SendResult>
  loadOlder: (cursor: Cursor) => Promise<ChatMessage[]>
  /** When set, the composer is replaced by this note (room closed, read-only fan…). */
  readOnly?: ReactNode
  placeholder?: string
  emptyText?: string
  /** Optional colour for the nickname / bubble edge of other fans' messages (e.g. by side in a match room). */
  tint?: (m: ChatMessage) => string | undefined
  /** Colour of the faint football doodle behind the chat (the club colour); the brand accent when unset. */
  doodle?: string
  /** Fans the viewer blocked: their messages are not shown. */
  hiddenUsers?: string[]
  /** Extra items shown in the stream by time (e.g. crowd-verdict polls), `at` = ISO time. */
  inserts?: { key: string; at: string; node: ReactNode }[]
  /** Other broadcast events on the same channel (e.g. 'poll', 'tally', 'poll_closed'). */
  onChannelEvent?: (event: string, payload: unknown) => void
  /** Shown just above the composer (e.g. the open poll's jump button). */
  pinned?: ReactNode
  /**
   * Open at the newest message when there is nothing unread (default, team chat). A room that sits under other
   * content (the match page's hero and tabs) passes false: the page stays put unless there is an unread divider to
   * open at, and the fan catches up with the "go down" button.
   */
  openAtEnd?: boolean
  /**
   * Presence topic the page already tracks for this fan (`online:<club>`, `room:<fixture>`): carries the "N כותבים…"
   * line. Without it, no typing line.
   */
  presenceTopic?: string
  /** Public chats: "דווח" on other fans' messages files a report of this kind with the message id. */
  reportKind?: 'team_message' | 'match_message'
  /**
   * Private messages from the chat (2026-10-16): another fan's avatar opens "שלח הודעה פרטית". Gives the writer's club
   * (name and colour) for the sheet; null when unknown.
   */
  clubOf?: (m: ChatMessage) => SheetFan['club']
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
  doodle,
  hiddenUsers,
  inserts,
  onChannelEvent,
  pinned,
  openAtEnd = true,
  presenceTopic,
  reportKind,
  clubOf,
}: ChatRoomProps) {
  const typing = useTyping(presenceTopic, meId, hiddenUsers)
  const [messages, setMessages] = useState<ChatMessage[]>(initial)
  // My messages on their way (one tick) or failed ("נסה שוב"); always the newest, so kept apart from the sorted list.
  const [pending, setPending] = useState<ChatMessage[]>([])
  const [hasOlder, setHasOlder] = useState(initial.length >= PAGE_SIZE)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [reporting, setReporting] = useState<ChatMessage | null>(null)
  const [reportNote, setReportNote] = useState<string | null>(null)
  const [fan, setFan] = useState<SheetFan | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  // Server ids my sends already confirmed: their realtime echo replaces no "sending" copy.
  const confirmed = useRef(new Set<string>())
  // The message each of my pending replies answers, to put the quote back if the text is refused.
  const replyOf = useRef(new Map<string, ChatMessage>())
  const draftRef = useRef('')
  useEffect(() => {
    draftRef.current = draft
  })
  const now = useNowMinute()

  const visible = hiddenUsers?.length ? messages.filter((m) => !hiddenUsers.includes(m.user_id)) : messages
  const all = pending.length ? [...visible, ...pending] : visible

  const isMine = useCallback((m: ChatMessage) => m.user_id === meId, [meId])
  const { divider, entered } = useReadPosition({
    chat: `${meId}:${topic}`,
    items: visible,
    ready: true,
    isMine,
    hasOlder,
    root,
    bottom,
    openAtEnd,
  })
  const follow = useFollowEnd(all, bottom, { enabled: entered, initialAtBottom: openAtEnd, extraCount: inserts?.length ?? 0 })

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
        if (!m) return
        // My own message can arrive here before the send returns: it replaces its "sending" copy.
        if (m.user_id === meId) {
          setPending((cur) => {
            const i = echoMatch(cur, { id: m.id, text: m.body, reply_to: m.reply_to }, confirmed.current, (p) => p.body)
            return i < 0 ? cur : cur.filter((_, j) => j !== i)
          })
        }
        setMessages((cur) => mergeMessages(cur, [m]))
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
  }, [topic, meId])

  const deliver = async (p: ChatMessage) => {
    let res: SendResult
    try {
      res = await send(p.body, p.reply_to ?? undefined)
    } catch {
      res = { error: 'ההודעה לא נשלחה. נסה שוב' }
    }
    if ('message' in res) {
      const saved = res.message
      confirmed.current.add(saved.id)
      replyOf.current.delete(p.id)
      setPending((cur) => cur.filter((x) => x.id !== p.id))
      setMessages((cur) => mergeMessages(cur, [saved]))
      setError(null)
      return
    }
    setError(res.error)
    const plan = failurePlan(res.kind)
    if (plan.keepBubble) {
      setPending((cur) => cur.map((x) => (x.id === p.id ? { ...x, failed: true } : x)))
      return
    }
    // Refused for good (offensive text, room closed, quote gone…): no pointless retry, the text goes back to the box.
    const quoted = replyOf.current.get(p.id)
    replyOf.current.delete(p.id)
    setPending((cur) => cur.filter((x) => x.id !== p.id))
    if (plan.restoreText && !draftRef.current.trim()) {
      setDraft(p.body)
      if (plan.restoreQuote && quoted) setReplyTo((cur) => cur ?? quoted)
    }
  }

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    typing.onStop()
    const p: ChatMessage = {
      id: `${LOCAL_ID}${crypto.randomUUID()}`,
      user_id: meId,
      nick: '',
      body,
      created_at: new Date().toISOString(),
      reply_to: replyTo?.id ?? null,
      reply_user: replyTo?.user_id ?? null,
      reply_nick: replyTo?.nick ?? null,
      reply_body: replyTo ? replySnippet(replyTo.body) : null,
    }
    if (replyTo) replyOf.current.set(p.id, replyTo)
    follow.followNext()
    setPending((cur) => [...cur, p])
    setDraft('')
    setReplyTo(null)
    setError(null)
    void deliver(p)
  }

  // Stable handlers for the memoised rows read the latest pending list and send function through a ref.
  const latest = useRef({ deliver, pending })
  useEffect(() => {
    latest.current = { deliver, pending }
  })
  const retry = useCallback((id: string) => {
    const p = latest.current.pending.find((x) => x.id === id)
    if (!p) return
    setPending((cur) => cur.map((x) => (x.id === id ? { ...x, failed: false } : x)))
    void latest.current.deliver({ ...p, failed: false })
  }, [])
  const discard = useCallback((id: string) => {
    replyOf.current.delete(id)
    setPending((cur) => cur.filter((x) => x.id !== id))
  }, [])
  const startReply = useCallback((m: ChatMessage) => {
    setReplyTo(m)
    input.current?.focus()
  }, [])
  const jump = useCallback((id: string) => jumpToMessage(root.current, id), [])
  const startReport = useCallback((m: ChatMessage) => {
    setReportNote(null)
    setReporting(m)
  }, [])
  // Kept in a ref: pages pass a new function each render, and the memoised rows must not all re-render for it.
  const clubOfRef = useRef(clubOf)
  useEffect(() => {
    clubOfRef.current = clubOf
  })
  const openFan = useCallback((m: ChatMessage) => setFan({ id: m.user_id, nick: m.nick, club: clubOfRef.current?.(m) ?? null }), [])

  const firstSaved = messages[0]
  const loadedIds = new Set(messages.map((m) => m.id))
  const hiddenIds = new Set(hiddenUsers?.length ? messages.filter((m) => hiddenUsers.includes(m.user_id)).map((m) => m.id) : [])

  let prevAt: string | undefined
  const rows: ReactNode[] = []
  for (const item of stream(all, inserts)) {
    if (item.kind === 'x') {
      rows.push(
        <li key={item.key} className="flex flex-col self-stretch">
          {item.node}
        </li>,
      )
      continue
    }
    const m = item.m
    if (startsNewDay(prevAt, m.created_at)) rows.push(<DayDivider key={`day-${m.id}`} at={m.created_at} now={now} />)
    prevAt = m.created_at
    if (divider?.id === m.id) rows.push(<UnreadDivider key="unread" label={divider.label} />)
    const mine = m.user_id === meId
    rows.push(
      <MessageItem
        key={m.id}
        m={m}
        mine={mine}
        color={mine ? undefined : tint?.(m)}
        active={active === m.id}
        onActive={setActive}
        onReply={readOnly || m.id.startsWith(LOCAL_ID) ? undefined : startReply}
        onReport={canReport(m, meId, Boolean(reportKind)) ? startReport : undefined}
        onFan={clubOf ? openFan : undefined}
        quoteLoaded={!!m.reply_to && loadedIds.has(m.reply_to)}
        quoteHidden={!!m.reply_to && (hiddenIds.has(m.reply_to) || (!!m.reply_user && !!hiddenUsers?.includes(m.reply_user)))}
        onJump={jump}
        onRetry={retry}
        onDiscard={discard}
      />,
    )
  }

  return (
    <div
      ref={root}
      className="chat-doodle flex min-h-[60dvh] flex-col"
      style={doodle ? ({ '--doodle': doodle } as CSSProperties) : undefined}
      // Escape anywhere in the chat (box, reply bar, message actions) cancels a reply and closes the actions.
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || (!replyTo && !active && !reporting)) return
        e.preventDefault()
        setActive(null)
        setReporting(null)
        if (replyTo) {
          setReplyTo(null)
          input.current?.focus()
        }
      }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-muted" aria-live="polite">
        <span className={cn('size-2 rounded-full', live ? 'bg-ok' : 'bg-dim')} aria-hidden="true" />
        {live ? 'מחובר בזמן אמת' : 'מתחבר…'}
      </div>
      <span className="sr-only" aria-live="polite">
        {divider?.label ?? ''}
      </span>

      <ol className="flex flex-1 flex-col gap-2" aria-label="הודעות">
        {hasOlder && firstSaved && (
          <li className="self-center">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={async () => {
                setLoadingOlder(true)
                try {
                  const older = await loadOlder({ createdAt: firstSaved.created_at, id: firstSaved.id })
                  setMessages((cur) => mergeMessages(cur, older))
                  setHasOlder(older.length >= PAGE_SIZE)
                } finally {
                  setLoadingOlder(false)
                }
              }}
              className="min-h-11 rounded-full border border-line px-3 py-1 text-xs text-muted disabled:opacity-50"
            >
              {loadingOlder ? 'טוען…' : 'הודעות קודמות'}
            </button>
          </li>
        )}
        {all.length === 0 && <li className="py-10 text-center text-muted">{emptyText ?? 'עוד אין הודעות.'}</li>}
        {rows}
        <div ref={bottom} className="scroll-mb-48" />
      </ol>

      <div className="chat-dock z-10 grid gap-2">
        {!follow.atBottom && <JumpButton count={follow.unread} onClick={follow.toEnd} />}
        {pinned}
        {presenceTopic && <TypingLine count={typing.count} />}
        {reporting && reportKind && (
          <section aria-label="דיווח על הודעה" className="space-y-2 rounded-xl border border-line bg-elev/95 p-3 backdrop-blur">
            <div className="flex items-start gap-2">
              <Flag className="mt-0.5 size-4 shrink-0 text-live" aria-hidden="true" />
              <div className="min-w-0 flex-1 text-sm">
                <b>דיווח על ההודעה של {reporting.nick}</b>
                <p className="truncate text-muted">{replySnippet(reporting.body)}</p>
              </div>
              <button type="button" className="chat-replybar-x" onClick={() => setReporting(null)} aria-label="ביטול הדיווח">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <ReportForm
              key={reporting.id}
              kind={reportKind}
              refId={reporting.id}
              className="space-y-2"
              onDone={(msg) => {
                setReporting(null)
                setReportNote(msg)
              }}
            />
          </section>
        )}
        {reportNote && (
          <p role="status" className="text-center text-xs text-muted">
            {reportNote}
          </p>
        )}
        {readOnly ? (
          <p className="rounded-xl border border-line bg-elev/95 p-3 text-center text-sm text-muted backdrop-blur">{readOnly}</p>
        ) : (
          <div className="rounded-xl border border-line bg-elev/95 backdrop-blur">
            {replyTo && (
              <ReplyBar
                nick={replyTo.user_id === meId ? 'עצמך' : replyTo.nick}
                text={replySnippet(replyTo.body)}
                onCancel={() => {
                  setReplyTo(null)
                  input.current?.focus()
                }}
              />
            )}
            <form
              className="flex items-end gap-2 p-2"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <label className="sr-only" htmlFor={`chat-input-${topic}`}>
                הודעה
              </label>
              <textarea
                ref={input}
                id={`chat-input-${topic}`}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  if (e.target.value.trim()) typing.onInput()
                  else typing.onStop()
                }}
                onBlur={typing.onStop}
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
                disabled={!draft.trim()}
                aria-label="שלח"
                className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-white disabled:opacity-40"
              >
                <SendHorizontal className="size-5 -scale-x-100" aria-hidden="true" />
              </button>
            </form>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-live">
          {error}
        </p>
      )}
      <FanSheet fan={fan} onClose={() => setFan(null)} />
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

/** One message; memoised so a ticking poll countdown does not re-render the whole conversation. */
const MessageItem = memo(function MessageItem({
  m,
  mine,
  color,
  active,
  onActive,
  onReply,
  onReport,
  onFan,
  quoteLoaded,
  quoteHidden,
  onJump,
  onRetry,
  onDiscard,
}: {
  m: ChatMessage
  mine: boolean
  color?: string
  active: boolean
  onActive: (id: string | null) => void
  onReply?: (m: ChatMessage) => void
  onReport?: (m: ChatMessage) => void
  onFan?: (m: ChatMessage) => void
  quoteLoaded: boolean
  quoteHidden: boolean
  onJump: (id: string) => void
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
}) {
  const state = mine ? sendState(m) : undefined
  return (
    <MessageRow
      id={m.id}
      at={m.id.startsWith(LOCAL_ID) ? undefined : m.created_at}
      mine={mine}
      active={active}
      onActive={onActive}
      onReply={onReply ? () => onReply(m) : undefined}
      onReport={onReport ? () => onReport(m) : undefined}
    >
      {!mine && (
        <span className="chat-author-row">
          <MessageAuthor mine={false} userId={m.user_id} nick={m.nick} onFan={onFan ? () => onFan(m) : undefined} />
          <span className="mb-0.5 px-1 text-xs font-semibold text-accent-text" style={color ? { color } : undefined}>
            {m.nick}
          </span>
        </span>
      )}
      <div
        className={cn('chat-bubble', mine ? 'bg-accent text-white' : 'border border-line-soft bg-surface-2')}
        style={color ? { borderInlineStartColor: color, borderInlineStartWidth: 3 } : undefined}
      >
        {m.reply_to && (
          <Quote
            mine={mine}
            nick={quoteHidden ? 'אוהד' : (m.reply_nick ?? 'הודעה קודמת')}
            text={quoteHidden ? 'הודעה מוסתרת' : (m.reply_body ?? '')}
            onJump={quoteLoaded && !quoteHidden && m.reply_to ? () => onJump(m.reply_to as string) : undefined}
          />
        )}
        {m.body}
      </div>
      <MessageMeta
        at={m.created_at}
        state={state}
        onRetry={state === 'failed' ? () => onRetry(m.id) : undefined}
        onDiscard={state === 'failed' ? () => onDiscard(m.id) : undefined}
      />
    </MessageRow>
  )
})
