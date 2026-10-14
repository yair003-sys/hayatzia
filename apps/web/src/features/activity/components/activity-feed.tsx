'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { debounce } from '@/lib/debounce'
import { createClient } from '@/lib/supabase/client'
import { listenPrivate } from '@/lib/supabase/shared-channel'
import { whileVisible } from '@/lib/while-visible'
import { ACTIVITY_SEEN_EVENT, mergeItems } from '../activity'
import { loadMoreActivityAction, markActivitySeenAction } from '../server/actions'
import type { ActivityItem } from '../server/queries'
import { ActivityRows } from './activity-rows'

/** A burst of changes becomes one refresh, at the latest REFRESH_MAX_MS after the first. */
const REFRESH_MS = 800
const REFRESH_MAX_MS = 3000

/**
 * The list on screen. The first page comes from the server (and again on every live refresh); pages loaded with
 * "עוד" are kept across refreshes (mergeItems). The highlight uses the previous visit as it was when the page opened,
 * for the whole visit. The visit is recorded up to the newest row actually shown (`newestAt`), so a row that changes
 * after the render stays unread: the bell shows it and the live listener refreshes the list.
 */
export function ActivityFeed({
  meId,
  items,
  next,
  seenAt,
  newestAt,
  empty,
}: {
  meId: string
  items: ActivityItem[]
  next: string | null
  seenAt: string | null
  newestAt: string | null
  empty: ReactNode
}) {
  const router = useRouter()
  // The first render's view of the previous visit, kept while the page stays open (refreshes included).
  const [visitSeenAt] = useState(seenAt)
  const [held, setHeld] = useState(items)
  const [cursor, setCursor] = useState(next)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  // A refreshed first page merges over what is on screen.
  const [seenItems, setSeenItems] = useState(items)
  if (seenItems !== items) {
    setSeenItems(items)
    // No next page: the first page is now the whole list (rows held below it were removed).
    setHeld((h) => mergeItems(items, h, next === null))
    if (next === null) setCursor(null)
  }

  useEffect(() => {
    if (!newestAt) return
    void markActivitySeenAction({ upto: newestAt })
      .then((r) => {
        if (r?.data?.ok) window.dispatchEvent(new Event(ACTIVITY_SEEN_EVENT))
      })
      .catch(() => {})
  }, [newestAt])

  useEffect(() => {
    const refresh = debounce(
      () => {
        router.refresh()
      },
      REFRESH_MS,
      REFRESH_MAX_MS,
    )
    const stop = whileVisible(() => {
      const off = listenPrivate(createClient(), `inbox:${meId}`, (m) => {
        if (m.event === 'activity') refresh.call()
      })
      return () => {
        off()
      }
    })
    return () => {
      stop()
      refresh.cancel()
    }
  }, [meId, router])

  const load = () => {
    const from = cursor
    if (!from) return
    start(async () => {
      const r = await loadMoreActivityAction({ cursor: from })
      if (!r?.data) {
        setFailed(true)
        return
      }
      setFailed(false)
      const more = r.data.items
      setHeld((h) => {
        const ids = new Set(h.map((x) => x.id))
        return [...h, ...more.filter((x) => !ids.has(x.id))]
      })
      setCursor(r.data.next)
    })
  }

  // Every row of a page may be hidden (a blocked fan's requests): keep going rather than call the list empty.
  const starving = held.length === 0 && cursor !== null && !failed
  useEffect(() => {
    if (starving && !pending) load()
    // `load` is recreated every render; the conditions above decide when to run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starving, pending, cursor])

  if (held.length === 0 && !starving && !failed) return <>{empty}</>

  return (
    <>
      {held.length > 0 && <ActivityRows items={held} seenAt={visitSeenAt} />}
      {starving && <div className="skeleton h-16 rounded-xl" aria-hidden="true" />}
      {failed && (
        <p role="alert" className="text-center text-sm text-live">
          לא הצלחנו לטעון. נסה שוב
        </p>
      )}
      {cursor && !starving && (
        <button type="button" className="act-more" onClick={load} disabled={pending}>
          {pending ? 'טוען…' : 'עוד התראות'}
        </button>
      )}
    </>
  )
}
