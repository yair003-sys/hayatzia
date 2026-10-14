'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell as BellIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { listenPrivate } from '@/lib/supabase/shared-channel'
import { whileVisible } from '@/lib/while-visible'
import { ACTIVITY_SEEN_EVENT, badgeLabel, bellLabel } from '../activity'

/** Several changes in a burst (a clip going viral) become one count request. */
const REFETCH_MS = 600

/**
 * The bell at the top corner of every in-app screen, with the red count of what changed since the fan last opened
 * the list. Live while the page is visible: an `activity` broadcast on `inbox:<me>` (ids only; shared with the banner
 * and the inbox through listenPrivate) re-reads the count. Opening the list clears it (ACTIVITY_SEEN_EVENT).
 */
export function Bell({ meId, count: serverCount }: { meId: string; count: number }) {
  const pathname = usePathname()
  const [supabase] = useState(() => createClient())
  const [count, setCount] = useState(serverCount)
  // A new server count (a refresh) wins; in between, the live updates.
  const [seenServer, setSeenServer] = useState(serverCount)
  if (seenServer !== serverCount) {
    setSeenServer(serverCount)
    setCount(serverCount)
  }
  // Bumped when the list is opened, so a count request that started before it cannot bring the old number back.
  const generation = useRef(0)

  useEffect(() => {
    const onSeen = () => {
      generation.current++
      setCount(0)
    }
    window.addEventListener(ACTIVITY_SEEN_EVENT, onSeen)
    return () => {
      window.removeEventListener(ACTIVITY_SEEN_EVENT, onSeen)
    }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let first = true
    const refetch = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const gen = generation.current
        const { data, error } = await supabase.rpc('activity_unread_count')
        if (!error && typeof data === 'number' && gen === generation.current) setCount(data)
      }, REFETCH_MS)
    }
    const stop = whileVisible(() => {
      // Back from the background: what changed meanwhile came by phone push only, so read the count again.
      if (!first) refetch()
      first = false
      const off = listenPrivate(supabase, `inbox:${meId}`, (m) => {
        if (m.event === 'activity') refetch()
      })
      return () => {
        off()
      }
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [supabase, meId])

  // On the list itself everything is on screen: no badge.
  const here = pathname === '/activity'
  const shown = here ? 0 : count
  const badge = badgeLabel(shown)
  return (
    <Link href="/activity" className="bell" aria-label={bellLabel(shown)} aria-current={here ? 'page' : undefined}>
      <BellIcon aria-hidden="true" className="size-[1.3rem]" strokeWidth={2.1} />
      {badge && (
        <span key={badge} className="bell-badge t-num" aria-hidden="true">
          {badge}
        </span>
      )}
    </Link>
  )
}
