'use client'

import { useState } from 'react'
import { Lock, SendHorizontal } from 'lucide-react'
import { chatTime } from '@/features/chat/schema'
import { cn } from '@/lib/utils'
import { DM_MAX } from '../schema'

/** One message bubble. Mine sit at the start (right in RTL) in the accent colour. */
export function Bubble({
  mine,
  text,
  createdAt,
  sender,
  locked = 'הודעה שנשלחה לפני שהמכשיר הזה הופעל',
}: {
  mine: boolean
  text: string | null
  createdAt: string
  sender?: { nick: string; hue: number }
  locked?: string
}) {
  return (
    <li className={cn('flex max-w-[85%] flex-col', mine ? 'self-start' : 'self-end')}>
      <div className={cn('rounded-lg px-3 py-2 break-words whitespace-pre-wrap', mine ? 'bg-accent text-white' : 'border border-line-soft bg-surface-2')}>
        {sender && (
          <b className="mb-0.5 block text-xs font-semibold" style={{ color: `hsl(${sender.hue} 75% 68%)` }}>
            {sender.nick}
          </b>
        )}
        {text ?? (
          <span className="inline-flex items-center gap-1 text-xs italic opacity-70">
            <Lock className="size-3" aria-hidden="true" /> {locked}
          </span>
        )}
      </div>
      <time dateTime={createdAt} className="mt-0.5 px-1 text-[11px] text-dim">
        {chatTime(createdAt)}
      </time>
    </li>
  )
}

/** Composer: Enter sends, Shift+Enter breaks a line. Clears only when `onSend` reports success. */
export function Composer({
  ready,
  sending,
  placeholder,
  label,
  onSend,
}: {
  ready: boolean
  sending: boolean
  placeholder: string
  label: string
  onSend: (text: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState('')
  const send = async () => {
    const text = draft.trim()
    if (!text || !ready || sending) return
    if (await onSend(text)) setDraft('')
  }
  return (
    <form
      className="sticky bottom-[calc(var(--tabbar-space)+0.75rem)] mt-4 flex items-end gap-2 rounded-xl border border-line bg-elev/95 p-2 backdrop-blur"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <label htmlFor="dm-input" className="sr-only">
        {label}
      </label>
      <textarea
        id="dm-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
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
  )
}

export function E2eNote({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-xs text-muted">
      <Lock className="size-3.5 text-ok" aria-hidden="true" />
      מוצפן מקצה לקצה. גם אנחנו לא יכולים לקרוא.
      {children}
    </div>
  )
}
