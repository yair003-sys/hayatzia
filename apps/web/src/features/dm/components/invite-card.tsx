'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Invite } from '../schema'
import { answerInviteAction } from '../server/actions'
import { Avatar } from './avatar'

/** "דני הזמין אותך לקבוצה…" with join / decline. Joining opens the group; declining removes the invite. */
export function InviteCard({ invite }: { invite: Invite }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const answer = (yes: boolean) =>
    start(async () => {
      setError(null)
      const r = await answerInviteAction({ groupId: invite.groupId, yes })
      if (r?.data && 'error' in r.data) setError(r.data.error)
      else if (r?.serverError || r?.validationErrors) setError('הפעולה נכשלה. נסה שוב')
      else if (!yes) router.refresh()
    })

  return (
    <li className="ib-invite">
      <div className="flex items-center gap-3">
        <Avatar id={invite.groupId} name={invite.name} group />
        <p className="min-w-0 flex-1 text-sm leading-snug text-muted">
          <b className="font-semibold text-fg">{invite.invitedBy}</b> הזמין אותך לקבוצה{' '}
          <b className="font-semibold text-fg">&#x27;{invite.name}&#x27;</b>
          <span className="block text-xs text-dim">
            <span className="t-num">{invite.members}</span> חברים
          </span>
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => answer(true)} className="ib-pill ib-pill-blue">
          הצטרפות
        </button>
        <button type="button" disabled={pending} onClick={() => answer(false)} className="ib-pill">
          לא תודה
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
    </li>
  )
}
