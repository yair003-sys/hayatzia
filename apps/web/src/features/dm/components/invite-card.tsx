'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { membersLabel, type Invite } from '../schema'
import { answerInviteAction } from '../server/actions'
import { Avatar } from './avatar'

/** "דני הזמין אותך לקבוצה…" with join / decline. Joining opens the group; declining removes the invite. */
export function InviteCard({ invite }: { invite: Invite }) {
  const t = useTranslations('dm')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const answer = (yes: boolean) =>
    start(async () => {
      setError(null)
      const r = await answerInviteAction({ groupId: invite.groupId, yes })
      if (r?.data?.error) setError(r.data.error)
      else if (r?.serverError || r?.validationErrors) setError(t('actionFailed'))
      else if (!yes) router.refresh()
    })

  return (
    <li className="ib-invite">
      <div className="flex items-center gap-3">
        <Avatar id={invite.groupId} name={invite.name} group />
        <p className="min-w-0 flex-1 text-sm leading-snug text-muted">
          {t.rich('invitedToGroup', {
            invitedBy: invite.invitedBy,
            name: invite.name,
            b: (chunks) => <b className="font-semibold text-fg">{chunks}</b>,
          })}
          <span className="block text-xs text-dim">
            {membersLabel(invite.members)}
          </span>
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => answer(true)} className="ib-pill ib-pill-blue">
          {t('join')}
        </button>
        <button type="button" disabled={pending} onClick={() => answer(false)} className="ib-pill">
          {t('decline')}
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
