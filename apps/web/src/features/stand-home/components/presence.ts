'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { openChannel } from '@/lib/supabase/channel'
import { createClient } from '@/lib/supabase/client'
import { countUsers } from '../schema'

/**
 * Realtime Presence on a private topic. With `userId` the fan is tracked (counted); without it the hook only listens.
 * Returns the number of distinct fans present, or null until the first sync.
 */
export function usePresence(topic: string | null, userId?: string): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!topic) {
      const reset = setTimeout(() => setCount(null), 0)
      return () => clearTimeout(reset)
    }
    const supabase = createClient()
    let cancelled = false
    let channel: RealtimeChannel | null = null
    void (async () => {
      const ch = await openChannel(supabase, topic, { private: true, presence: { key: userId ?? '' } })
      if (cancelled) return void supabase.removeChannel(ch)
      channel = ch
      ch.on('presence', { event: 'sync' }, () => {
        setCount(countUsers(ch.presenceState() as Record<string, { user_id?: string }[]>))
      })
      await supabase.realtime.setAuth()
      if (cancelled) return
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED' && userId) void ch.track({ user_id: userId })
      })
    })()
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
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
