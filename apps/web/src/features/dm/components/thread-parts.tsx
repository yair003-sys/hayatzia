'use client'

import { useState, type ReactNode, type Ref } from 'react'
import { Lock, SendHorizontal } from 'lucide-react'
import { MessageMeta, MessageRow, Quote, ReplyBar } from '@/features/chat/components/chat-parts'
import { isLocalId, sendState } from '@/features/chat/essentials'
import { cn } from '@/lib/utils'
import { DM_MAX } from '../schema'

/** A quoted message as the device found it: decrypted from the loaded messages, or "הודעה קודמת" when not loaded. */
export type ShownQuote = { nick: string; text: string; onJump?: () => void }

/** One message bubble. Mine sit at the start (right in RTL) in the accent colour. */
export function Bubble({
  id,
  mine,
  text,
  createdAt,
  sender,
  locked = 'הודעה שנשלחה לפני שהמכשיר הזה הופעל',
  failed,
  quote,
  active,
  onActive,
  onReply,
  onRetry,
  onDiscard,
}: {
  id: string
  mine: boolean
  text: string | null
  createdAt: string
  sender?: { nick: string; hue: number }
  locked?: string
  failed?: boolean
  quote?: ShownQuote | null
  active: boolean
  onActive: (id: string | null) => void
  onReply?: () => void
  onRetry?: () => void
  onDiscard?: () => void
}) {
  const local = isLocalId(id)
  const state = mine ? sendState({ id, failed }) : undefined
  return (
    <MessageRow id={id} at={local ? undefined : createdAt} mine={mine} active={active} onActive={onActive} onReply={local ? undefined : onReply}>
      <div className={cn('chat-bubble', mine ? 'bg-accent text-white' : 'border border-line-soft bg-surface-2')}>
        {sender && (
          <b className="mb-0.5 block text-xs font-semibold" style={{ color: `hsl(${sender.hue} 75% 68%)` }}>
            {sender.nick}
          </b>
        )}
        {quote && <Quote mine={mine} nick={quote.nick} text={quote.text} onJump={quote.onJump} />}
        {text ?? (
          <span className="inline-flex items-center gap-1 text-xs italic opacity-70">
            <Lock className="size-3" aria-hidden="true" /> {locked}
          </span>
        )}
      </div>
      <MessageMeta at={createdAt} state={state} onRetry={state === 'failed' ? onRetry : undefined} onDiscard={state === 'failed' ? onDiscard : undefined} />
    </MessageRow>
  )
}

/**
 * Composer: Enter sends, Shift+Enter breaks a line, Escape cancels a reply. Clears only when `onSend` reports success
 * (the threads report it as soon as the message is on its way: it then shows with one tick).
 */
export function Composer({
  ready,
  sending = false,
  placeholder,
  label,
  onSend,
  reply,
  onCancelReply,
  inputRef,
  above,
}: {
  ready: boolean
  sending?: boolean
  placeholder: string
  label: string
  onSend: (text: string) => Promise<boolean>
  /** The message being answered, shown above the box with ✕. */
  reply?: { nick: string; text: string } | null
  onCancelReply?: () => void
  inputRef?: Ref<HTMLTextAreaElement>
  /** Floats above the box (the "go down" button). */
  above?: ReactNode
}) {
  const [draft, setDraft] = useState('')
  const send = async () => {
    const text = draft.trim()
    if (!text || !ready || sending) return
    if (await onSend(text)) setDraft('')
  }
  return (
    <div className="chat-dock z-10">
      {above}
      <div className="rounded-xl border border-line bg-elev/95 backdrop-blur">
        {reply && onCancelReply && <ReplyBar nick={reply.nick} text={reply.text} onCancel={onCancelReply} />}
        <form
          className="flex items-end gap-2 p-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label htmlFor="dm-input" className="sr-only">
            {label}
          </label>
          <textarea
            ref={inputRef}
            id="dm-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              } else if (e.key === 'Escape' && reply && onCancelReply) {
                e.preventDefault()
                onCancelReply()
              }
            }}
            maxLength={DM_MAX}
            rows={1}
            disabled={!ready}
            placeholder={ready ? placeholder : 'מכין הצפנה…'}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 outline-none"
          />
          <button type="submit" disabled={sending || !ready || !draft.trim()} aria-label="שלח" className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-white disabled:opacity-40">
            <SendHorizontal className="size-5 -scale-x-100" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  )
}

export function E2eNote({ children }: { children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-xs text-muted">
      <Lock className="size-3.5 text-ok" aria-hidden="true" />
      מוצפן מקצה לקצה. גם אנחנו לא יכולים לקרוא.
      {children}
    </div>
  )
}
