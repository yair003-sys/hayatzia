'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle } from 'lucide-react'
import { Avatar } from '@/features/dm/components/avatar'
import { openThreadAction } from '@/features/dm/server/actions'

export type SheetFan = { id: string; nick: string; club: { name: string; color: string } | null }

/**
 * Tapping another fan's avatar in a chat (2026-10-16): who it is (nick, club) and "שלח הודעה פרטית". Works for fans of
 * the rival club too; the first message arrives as a request the fan accepts or blocks.
 */
export function FanSheet({ fan, onClose }: { fan: SheetFan | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (!fan) return null
  const close = () => {
    setError(null)
    onClose()
  }
  return createPortal(
    <div
      className="sq-sheet-wrap"
      onClick={close}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          close()
        }
      }}
    >
      <div className="sq-sheet ib-sheet" role="dialog" aria-modal="true" aria-label={fan.nick} onClick={(e) => e.stopPropagation()}>
        <span className="sq-grip" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <Avatar id={fan.id} name={fan.nick} />
          <div className="min-w-0">
            <p className="t-sec truncate">{fan.nick}</p>
            {fan.club && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <span className="size-2.5 rounded-full" style={{ background: fan.club.color }} aria-hidden="true" />
                {fan.club.name}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          className="su-btn su-btn-blue mt-4 flex items-center justify-center gap-2"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await openThreadAction({ otherId: fan.id })
              // Success redirects to the conversation; anything returned is a refusal.
              const e = r?.data && 'error' in r.data ? r.data.error : r?.serverError
              if (e) setError(e)
            })
          }
        >
          <MessageCircle className="size-5" aria-hidden="true" />
          {pending ? 'פותח…' : 'שלח הודעה פרטית'}
        </button>
        <p className="mt-2 text-center text-xs text-dim">ההודעה הראשונה מגיעה כבקשה. {fan.nick} יחליט אם להמשיך.</p>
        {error && (
          <p role="alert" className="mt-2 text-center text-sm text-live">
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
