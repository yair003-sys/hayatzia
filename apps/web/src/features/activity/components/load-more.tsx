'use client'

import { useState, useTransition } from 'react'
import { loadMoreActivityAction } from '../server/actions'
import type { ActivityItem } from '../server/queries'
import { ActivityRows } from './activity-rows'

/** "עוד": the next pages of the list (keyset cursor from the server), appended below the server-rendered first page. */
export function LoadMore({ cursor, seenAt }: { cursor: string; seenAt: string | null }) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [next, setNext] = useState<string | null>(cursor)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  const load = () => {
    if (!next) return
    start(async () => {
      const r = await loadMoreActivityAction({ cursor: next, seenAt })
      if (!r?.data) {
        setFailed(true)
        return
      }
      setFailed(false)
      const more = r.data.items
      setItems((cur) => [...cur, ...more])
      setNext(r.data.next)
    })
  }

  return (
    <>
      {items.length > 0 && <ActivityRows items={items} />}
      {failed && (
        <p role="alert" className="text-center text-sm text-live">
          לא הצלחנו לטעון. נסה שוב
        </p>
      )}
      {next && (
        <button type="button" className="act-more" onClick={load} disabled={pending}>
          {pending ? 'טוען…' : 'עוד התראות'}
        </button>
      )}
    </>
  )
}
