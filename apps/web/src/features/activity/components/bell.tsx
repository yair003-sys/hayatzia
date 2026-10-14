'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell as BellIcon } from 'lucide-react'
import { Brand } from '@/components/brand'
import { debounce } from '@/lib/debounce'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { listenPrivate } from '@/lib/supabase/shared-channel'
import { whileVisible } from '@/lib/while-visible'
import { ACTIVITY_SEEN_EVENT, badgeLabel, bellLabel } from '../activity'

/** Screens that place the bell in their own header (the home), so the floating one stays away: one bell per screen. */
export const OWN_BELL_PATHS = new Set(['/stand'])

/** Full-screen reels keep their own top row (tabs and "+"), so there the bell floats alone in the corner. */
const IMMERSIVE = (pathname: string) => pathname === '/square' || pathname.startsWith('/square/')

/** The top bar of every in-app screen (owner, 2026-10-15): a floating rectangle that stays while the page scrolls,
 *  with the onefan logo (back to the home) at one end and the bell at the other. Not on screens that carry both in
 *  their own header (the home). */
export function FloatingBell(props: { meId: string; count: number }) {
  const pathname = usePathname()
  if (OWN_BELL_PATHS.has(pathname)) return null
  if (IMMERSIVE(pathname)) return <Bell {...props} />
  return (
    <header className="topbar">
      <Link href="/stand" aria-label="onefan, למסך הראשי" className="topbar-home">
        <Brand size={24} />
      </Link>
      <Bell {...props} inline />
    </header>
  )
}

/** Several changes in a burst (a clip going viral) become one count request, at the latest after REFETCH_MAX_MS. */
const REFETCH_MS = 600
const REFETCH_MAX_MS = 3000
/** A screen reader hears a new count at most this often. */
export const ANNOUNCE_EVERY_MS = 10_000

/**
 * The bell at the top corner of every in-app screen, with the red count of what changed since the fan last opened
 * the list. Live while the page is visible: an `activity` broadcast on `inbox:<me>` (ids only; shared with the banner
 * and the inbox through listenPrivate) re-reads the count. Opening the list (ACTIVITY_SEEN_EVENT) clears it, then the
 * count is read again: the visit covers only the rows the list showed.
 */
export function Bell({ meId, count: serverCount, inline = false }: { meId: string; count: number; inline?: boolean }) {
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
    const read = async () => {
      const gen = generation.current
      const { data, error } = await supabase.rpc('activity_unread_count')
      if (!error && typeof data === 'number' && gen === generation.current) setCount(data)
    }
    const refetch = debounce(
      () => {
        void read()
      },
      REFETCH_MS,
      REFETCH_MAX_MS,
    )
    const onSeen = () => {
      generation.current++
      setCount(0)
      refetch.call()
    }
    window.addEventListener(ACTIVITY_SEEN_EVENT, onSeen)
    const stop = whileVisible(() => {
      // On mount and back from the background, read the count: the server's number may be old (a bell mounted again
      // after the home, whose header carries its own bell, starts from the layout's first-load count), and what changed
      // while hidden came by phone push only.
      refetch.call()
      const off = listenPrivate(supabase, `inbox:${meId}`, (m) => {
        if (m.event === 'activity') refetch.call()
      })
      return () => {
        off()
      }
    })
    return () => {
      window.removeEventListener(ACTIVITY_SEEN_EVENT, onSeen)
      stop()
      refetch.cancel()
    }
  }, [supabase, meId])

  // On the list itself everything is on screen: no badge.
  const here = pathname === '/activity'
  const shown = here ? 0 : count
  const badge = badgeLabel(shown)

  // Polite announcement of a growing count, throttled (never on the first render).
  const [said, setSaid] = useState('')
  const last = useRef({ shown, at: 0 })
  useEffect(() => {
    const prev = last.current
    if (shown <= prev.shown) {
      last.current = { ...prev, shown }
      return
    }
    const wait = Math.max(0, prev.at + ANNOUNCE_EVERY_MS - Date.now())
    const t = setTimeout(() => {
      last.current = { shown, at: Date.now() }
      setSaid(`${badgeLabel(shown)} התראות חדשות`)
    }, wait)
    return () => {
      clearTimeout(t)
    }
  }, [shown])

  return (
    <>
      <Link href="/activity" className={cn('bell', inline && 'bell-inline')} aria-label={bellLabel(shown)} aria-current={here ? 'page' : undefined}>
        <span className="bell-face">
          <BellIcon aria-hidden="true" className="size-[1.3rem]" strokeWidth={2.1} />
          {badge && (
            <span key={badge} className="bell-badge t-num" aria-hidden="true">
              {badge}
            </span>
          )}
        </span>
      </Link>
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </>
  )
}
