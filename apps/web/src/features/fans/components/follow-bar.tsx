'use client'

import { useState, useTransition } from 'react'
import { UserCheck, UserPlus } from 'lucide-react'
import { toggleFollowAction } from '@/features/follows/server/actions'
import { shortCount } from '@/features/square/schema'

/**
 * Follow / following state for another fan's card, with live counters. The followers count moves with my own action;
 * the following count (how many they follow) is theirs and stays put. Optimistic, with a roll-back on failure.
 */
export function FollowBar({
  followeeId,
  initialFollowing,
  followers,
  following,
}: {
  followeeId: string
  initialFollowing: boolean
  followers: number
  following: number
}) {
  const [on, setOn] = useState(initialFollowing)
  const [count, setCount] = useState(followers)
  const [pending, start] = useTransition()

  const toggle = () => {
    const next = !on
    setOn(next)
    setCount((n) => Math.max(0, n + (next ? 1 : -1)))
    start(async () => {
      const r = await toggleFollowAction({ followeeId, on: next })
      if (!r.data?.ok) {
        setOn(!next)
        setCount((n) => Math.max(0, n - (next ? 1 : -1)))
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-5 text-sm font-extrabold transition-transform active:scale-95 disabled:opacity-60 ${
          on ? 'border border-line bg-surface-2 text-fg' : ''
        }`}
        style={on ? undefined : { background: 'rgb(var(--club-rgb))', color: 'var(--club-on)' }}
      >
        {on ? <UserCheck className="size-4" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}
        {on ? 'עוקב' : 'עקוב'}
      </button>
      <p className="flex items-center gap-3 text-sm text-muted">
        <span>
          <b className="t-num text-fg">{shortCount(count)}</b> עוקבים
        </span>
        <span>
          <b className="t-num text-fg">{shortCount(following)}</b> עוקב אחרי
        </span>
      </p>
    </div>
  )
}
