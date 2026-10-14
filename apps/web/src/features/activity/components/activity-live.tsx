'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { listenPrivate } from '@/lib/supabase/shared-channel'
import { whileVisible } from '@/lib/while-visible'
import { ACTIVITY_SEEN_EVENT } from '../activity'
import { markActivitySeenAction } from '../server/actions'

const REFRESH_MS = 800

/**
 * On the list: records the visit after the rows are on screen (the highlight was decided on the server from the
 * previous visit) and tells the bell to clear. While the page is visible, a change re-renders the list; the newest
 * row changes `stamp`, so the new visit is recorded again.
 */
export function ActivityLive({ meId, stamp }: { meId: string; stamp: string }) {
  const router = useRouter()

  useEffect(() => {
    void markActivitySeenAction()
      .then((r) => {
        if (r?.data?.ok) window.dispatchEvent(new Event(ACTIVITY_SEEN_EVENT))
      })
      .catch(() => {})
  }, [stamp])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = whileVisible(() => {
      const supabase = createClient()
      const off = listenPrivate(supabase, `inbox:${meId}`, (m) => {
        if (m.event !== 'activity') return
        clearTimeout(timer)
        timer = setTimeout(() => {
          router.refresh()
        }, REFRESH_MS)
      })
      return () => {
        off()
      }
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [meId, router])

  return null
}
