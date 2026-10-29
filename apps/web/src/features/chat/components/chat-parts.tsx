'use client'

import { useRef, useSyncExternalStore, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, ArrowDown, Check, CheckCheck, CornerUpLeft, Flag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/features/dm/components/avatar'
import { dayLabel, tickInfo, type SendState } from '../essentials'
import { chatTime } from '../schema'
import { scrollBehavior } from './use-read-position'

// Pieces shared by the four chat screens: day separators, the unread divider, time + ticks, replies and the
// "go down" button. Classes live in globals.css (chat-*).

// ---------- the clock, for "היום" / "אתמול" ----------
// Read through useSyncExternalStore (never Date.now() in render). Ticks once a minute; null on the server, so the
// first paint shows plain dates and the labels settle right after.
function clockSnapshot(): number {
  return Math.floor(Date.now() / 60_000)
}
function clockSubscribe(onChange: () => void) {
  const t = setInterval(onChange, 60_000)
  return () => clearInterval(t)
}
export function useNowMinute(): number | null {
  const m = useSyncExternalStore(clockSubscribe, clockSnapshot, () => 0)
  return m === 0 ? null : m * 60_000
}

export function DayDivider({ at, now }: { at: string; now: number | null }) {
  return (
    <li className="chat-day">
      <span>{dayLabel(at, now)}</span>
    </li>
  )
}

/** "N הודעות שלא נקראו" above the first unread message. Announced through the room's live region. */
export function UnreadDivider({ label }: { label: string }) {
  return (
    <li className="chat-unread" data-unread-divider="">
      <span>{label}</span>
    </li>
  )
}

/** One grey tick while sending, two once saved; with a text alternative. */
export function Ticks({ state }: { state: SendState }) {
  const { ticks, label } = tickInfo(state)
  if (ticks === 0) return null
  const Icon = ticks === 2 ? CheckCheck : Check
  return (
    <span className="chat-ticks" role="img" aria-label={label} title={label}>
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
  )
}

/** Time under a message, ticks on my own, and "נסה שוב" when it failed. */
export function MessageMeta({
  at,
  state,
  onRetry,
  onDiscard,
}: {
  at: string
  /** Only for my own messages. */
  state?: SendState
  onRetry?: () => void
  onDiscard?: () => void
}) {
  const t = useTranslations('chat')
  if (state === 'failed') {
    return (
      <span className="chat-meta chat-meta-failed">
        <AlertCircle className="size-3.5" aria-hidden="true" />
        {t('notSent')}
        {onRetry && (
          <button type="button" className="chat-meta-btn" onClick={onRetry}>
            {t('retry')}
          </button>
        )}
        {onDiscard && (
          <button type="button" className="chat-meta-btn" onClick={onDiscard} aria-label={t('removeMessage')}>
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </span>
    )
  }
  return (
    <span className="chat-meta">
      <time dateTime={at}>{chatTime(at)}</time>
      {state && <Ticks state={state} />}
    </span>
  )
}

/** The quoted message inside a reply. A button that jumps to the original when it is loaded. */
export function Quote({ nick, text, onJump, mine }: { nick: string; text: string; onJump?: () => void; mine: boolean }) {
  const t = useTranslations('chat')
  const body = (
    <>
      <b className="chat-quote-nick">{nick}</b>
      <span className="chat-quote-text">{text}</span>
    </>
  )
  if (!onJump) return <span className={cn('chat-quote', mine && 'chat-quote-mine')}>{body}</span>
  return (
    <button
      type="button"
      className={cn('chat-quote', mine && 'chat-quote-mine')}
      onClick={onJump}
      aria-label={t('quoteJump', { nick, text })}
    >
      {body}
    </button>
  )
}

/** Above the typing box while replying: who and what, and ✕ to cancel. */
export function ReplyBar({ nick, text, onCancel }: { nick: string; text: string; onCancel: () => void }) {
  const t = useTranslations('chat')
  return (
    <div className="chat-replybar">
      <CornerUpLeft className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <b className="chat-quote-nick">{t('replyingTo', { nick })}</b>
        <span className="chat-quote-text">{text}</span>
      </div>
      <button type="button" className="chat-replybar-x" onClick={onCancel} aria-label={t('cancelReply')}>
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/** Round "go down" button above the typing box, with a badge of messages that arrived while scrolled up. */
export function JumpButton({ count, onClick }: { count: number; onClick: () => void }) {
  const t = useTranslations('chat')
  return (
    <button
      type="button"
      className="chat-jump"
      onClick={onClick}
      aria-label={count > 0 ? t('toEndCount', { count }) : t('toEnd')}
    >
      <ArrowDown className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span className="chat-jump-badge" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}

/** Scrolls to a loaded message, moves focus there and flashes it (no flash, no smooth scroll with reduced motion). */
export function jumpToMessage(root: HTMLElement | null, id: string): boolean {
  const el = root?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
  el.focus({ preventScroll: true })
  el.classList.remove('chat-flash')
  void el.offsetWidth // restart the animation on a second jump
  el.classList.add('chat-flash')
  setTimeout(() => el.classList.remove('chat-flash'), 1600)
  return true
}

/**
 * One message row: tap (or long-press on touch) shows the "השב" action (and "דווח" on another fan's message in a
 * public chat); on a computer they show on hover, and they are always reachable by keyboard (Tab). `data-mid` / `data-at` let the chat find the message (jump, read position).
 */
export function MessageRow({
  id,
  at,
  mine,
  active,
  onActive,
  onReply,
  onReport,
  children,
}: {
  id: string
  /** Time saved by the server; left out for a message still on this device. */
  at?: string
  mine: boolean
  active: boolean
  onActive: (id: string | null) => void
  onReply?: () => void
  /** "דווח" (public chats, never on my own messages). */
  onReport?: () => void
  children: ReactNode
}) {
  const t = useTranslations('chat')
  const hasActions = Boolean(onReply || onReport)
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; long: boolean }>({ timer: null, long: false })
  const clear = () => {
    if (press.current.timer) clearTimeout(press.current.timer)
    press.current.timer = null
  }
  return (
    <li
      data-mid={id}
      data-at={at}
      tabIndex={-1}
      data-active={active ? '' : undefined}
      className={cn('chat-msg', mine ? 'chat-msg-mine' : 'chat-msg-other')}
      onClick={(e) => {
        if (!hasActions) return
        if (press.current.long) {
          press.current.long = false
          return
        }
        if ((e.target as HTMLElement).closest('button, a, input, textarea')) return
        if (window.getSelection()?.toString()) return // selecting text, not tapping
        onActive(active ? null : id)
      }}
      onPointerDown={(e) => {
        if (!hasActions || e.pointerType !== 'touch') return
        press.current.long = false
        clear()
        press.current.timer = setTimeout(() => {
          press.current.long = true
          onActive(id)
        }, 450)
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
    >
      {children}
      {hasActions && (
        <div className="chat-actions">
          {onReply && (
            <button
              type="button"
              className="chat-reply-btn"
              onClick={() => {
                onActive(null)
                onReply()
              }}
              aria-label={t('replyToMsg')}
            >
              <CornerUpLeft className="size-4" aria-hidden="true" />
              <span className="chat-reply-btn-text">{t('reply')}</span>
            </button>
          )}
          {onReport && (
            <button
              type="button"
              className="chat-reply-btn"
              onClick={() => {
                onActive(null)
                onReport()
              }}
              aria-label={t('reportMsg')}
            >
              <Flag className="size-4" aria-hidden="true" />
              <span className="chat-reply-btn-text">{t('report')}</span>
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * The round avatar of another fan's message (2026-10-16): a button that opens "שלח הודעה פרטית" to that fan, whatever
 * their club. Nothing on my own messages, or when the chat offers no private messages.
 */
export function MessageAuthor({ mine, userId, nick, onFan }: { mine: boolean; userId: string; nick: string; onFan?: () => void }) {
  const t = useTranslations('chat')
  if (mine || !onFan) return null
  return (
    <button type="button" className="chat-author" onClick={onFan} aria-label={t('sendPrivateTo', { nick })}>
      <Avatar id={userId} name={nick} size="sm" />
    </button>
  )
}
