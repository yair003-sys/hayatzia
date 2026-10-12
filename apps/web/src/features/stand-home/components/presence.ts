'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { countUsers } from '../schema'

/**
 * Realtime Presence on a private topic. With `userId` the fan is tracked (counted); without it the hook only listens.
 * Returns the number of distinct fans present, or null until the first sync.
 */
export function usePresence(topic: string | null, userId?: string): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!topic) return
    const supabase = createClient()
    let cancelled = false
    const channel = supabase.channel(topic, { config: { private: true, presence: { key: userId ?? '' } } })
    channel.on('presence', { event: 'sync' }, () => {
      setCount(countUsers(channel.presenceState() as Record<string, { user_id?: string }[]>))
    })
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' && userId) void channel.track({ user_id: userId })
      })
    })
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [topic, userId])
  return count
}

// "Online now" for the fan's club: tracked once for the whole app (layout), read anywhere.
let online: number | null = null
const listeners = new Set<() => void>()
const store = {
  set(v: number | null) {
    online = v
    for (const l of listeners) l()
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

/** Mounted once in the app layout for a signed-in fan: keeps them in `online:<club>`. */
export function OnlineTracker({ teamId, userId }: { teamId: string; userId: string }) {
  const n = usePresence(`online:${teamId}`, userId)
  useEffect(() => {
    store.set(n)
  }, [n])
  return null
}

export function useOnlineCount(): number | null {
  return useSyncExternalStore(
    store.subscribe,
    () => online,
    () => null,
  )
}
