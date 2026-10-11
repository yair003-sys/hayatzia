'use client'

import { useEffect, useRef, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { SendHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  chatTime,
  MESSAGE_MAX,
  mergeMessages,
  messageFromBroadcast,
  PAGE_SIZE,
  type ChatMessage,
} from '../schema'
import { loadOlderTeamMessagesAction, sendTeamMessageAction } from '../server/actions'

type Props = { teamId: string; meId: string; initial: ChatMessage[] }

export function TeamChat({ teamId, meId, initial }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial)
  const [hasOlder, setHasOlder] = useState(initial.length >= PAGE_SIZE)
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  const send = useAction(sendTeamMessageAction, {
    onSuccess: ({ data }) => {
      if (data && 'message' in data) {
        setMessages((cur) => mergeMessages(cur, [data.message]))
        setDraft('')
        stickToBottom.current = true
      }
    },
  })
  const older = useAction(loadOlderTeamMessagesAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      stickToBottom.current = false
      setMessages((cur) => mergeMessages(cur, data.messages))
      setHasOlder(data.messages.length >= PAGE_SIZE)
    },
  })
  const sendError =
    send.result.serverError ??
    (send.result.data && 'error' in send.result.data ? send.result.data.error : undefined) ??
    send.result.validationErrors?.body?._errors?.[0]

  // Live: the team's private broadcast channel (authorised by RLS on realtime.messages).
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const channel = supabase.channel(`team:${teamId}`, { config: { private: true } })
    channel.on('broadcast', { event: 'INSERT' }, ({ payload }) => {
      const m = messageFromBroadcast(payload)
      if (m) setMessages((cur) => mergeMessages(cur, [m]))
    })
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return
      channel.subscribe((status) => setLive(status === 'SUBSCRIBED'))
    })
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [teamId])

  useEffect(() => {
    if (stickToBottom.current) bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const first = messages[0]

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted" aria-live="polite">
        <span className={cn('size-2 rounded-full', live ? 'bg-ok' : 'bg-dim')} aria-hidden="true" />
        {live ? 'מחובר בזמן אמת' : 'מתחבר…'}
      </div>

      <ol className="flex flex-1 flex-col gap-2" aria-label="הודעות הצ׳אט">
        {hasOlder && first && (
          <li className="self-center">
            <button
              type="button"
              disabled={older.isPending}
              onClick={() => older.execute({ createdAt: first.created_at, id: first.id })}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted disabled:opacity-50"
            >
              {older.isPending ? 'טוען…' : 'הודעות קודמות'}
            </button>
          </li>
        )}
        {messages.length === 0 && (
          <li className="py-10 text-center text-muted">עוד אין הודעות. תפתח את היציע 👋</li>
        )}
        {messages.map((m) => {
          const mine = m.user_id === meId
          return (
            <li key={m.id} className={cn('flex max-w-[85%] flex-col', mine ? 'self-start' : 'self-end')}>
              {!mine && <span className="mb-0.5 px-1 text-xs font-semibold text-accent-text">{m.nick}</span>}
              <div
                className={cn(
                  'rounded-lg px-3 py-2 break-words whitespace-pre-wrap',
                  mine ? 'bg-accent text-white' : 'border border-line-soft bg-surface-2',
                )}
              >
                {m.body}
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
          if (draft.trim()) send.execute({ body: draft })
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          הודעה לצ׳אט
        </label>
        <textarea
          id="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (draft.trim() && !send.isPending) send.execute({ body: draft })
            }
          }}
          maxLength={MESSAGE_MAX}
          rows={1}
          placeholder="כתוב ליציע…"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 outline-none"
        />
        <button
          type="submit"
          disabled={send.isPending || !draft.trim()}
          aria-label="שלח"
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-white disabled:opacity-40"
        >
          <SendHorizontal className="size-5 -scale-x-100" aria-hidden="true" />
        </button>
      </form>
      {sendError && (
        <p role="alert" className="mt-2 text-sm text-live">
          {sendError}
        </p>
      )}
    </div>
  )
}
