'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { teamById } from '@/features/teams/data'
import { dmErrorHe } from '../schema'
import { openByCodeAction } from '../server/actions'
import { Avatar } from './avatar'

/**
 * /add/<code> (2026-10-16): the fan whose QR code was scanned (nick, club) and "שלח הודעה". The conversation opens
 * already accepted: showing the code is that fan's consent. A reset or unknown code shows "הברקוד לא תקף".
 */
export function AddCard({ code, card }: { code: string; card: { nick: string; teamId: string } | null }) {
  const t = useTranslations('dm')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (!card) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p role="alert" className="t-sec">
          {dmErrorHe('bad_code')}
        </p>
        <p className="text-sm text-muted">{t('badCodeHint')}</p>
        <Link href="/inbox" className="inline-flex min-h-11 items-center text-accent-text underline">
          {t('toInbox')}
        </Link>
      </div>
    )
  }
  const club = teamById(card.teamId)
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 text-center">
      <div className="flex flex-col items-center gap-2">
        <Avatar id={code} name={card.nick} />
        <p className="t-page">{card.nick}</p>
        {club && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <span className="size-3 rounded-full" style={{ background: club.bar, boxShadow: `0 0 0 2px ${club.ring}` }} aria-hidden="true" />
            {club.name}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={pending}
        className="su-btn su-btn-blue flex items-center justify-center gap-2"
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await openByCodeAction({ code })
            // Success redirects to the conversation; anything returned is a refusal.
            const e = r?.data && 'error' in r.data ? r.data.error : r?.serverError
            if (e) setError(e)
          })
        }
      >
        <MessageCircle className="size-5" aria-hidden="true" />
        {pending ? t('opening') : t('sendMessage')}
      </button>
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
    </div>
  )
}
