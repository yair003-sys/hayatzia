'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { openChannel } from '@/lib/supabase/channel'
import { createClient } from '@/lib/supabase/client'
import { countUsers } from '../schema'

/** What a tracked presence channel offers other components on the page (the chat's "typing" line). */
export type PresenceRoom = {
  /** The channel's presence state now (client-supplied metadata: check every field before use). */
  state(): Record<string, { user_id?: unknown; typing?: unknown }[]>
  /** Called on every presence sync. Returns a function that stops it. */
  onSync(cb: () => void): () => void
  /** Merges fields into this fan's tracked metadata (`user_id` stays) and re-tracks when connected. */
  setMeta(patch: Record<string, unknown>): void
}

// Tracked channels by topic, so a component can use a channel usePresence already holds instead of opening a second
// one (realtime-js keeps one channel per topic, and openChannel would drop the other's).
const rooms = new Map<string, PresenceRoom>()
const roomWatchers = new Set<() => void>()
const roomsChanged = () => {
  for (const w of roomWatchers) w()
}
const watchRooms = (w: () => void) => {
  roomWatchers.add(w)
  return () => {
    roomWatchers.delete(w)
  }
}

/** The tracked presence channel on `topic` held by a mounted usePresence(topic, userId), or null. */
export function usePresenceRoom(topic: string | undefined): PresenceRoom | null {
  return useSyncExternalStore(
    watchRooms,
    () => (topic ? (rooms.get(topic) ?? null) : null),
    () => null,
  )
}

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
    let room: PresenceRoom | null = null
    void (async () => {
      const ch = await openChannel(supabase, topic, { private: true, presence: { key: userId ?? '' } })
      if (cancelled) return void supabase.removeChannel(ch)
      channel = ch
      const syncs = new Set<() => void>()
      ch.on('presence', { event: 'sync' }, () => {
        setCount(countUsers(ch.presenceState() as Record<string, { user_id?: string }[]>))
        for (const cb of [...syncs]) cb()
      })
      let subscribed = false
      const meta: Record<string, unknown> = { user_id: userId }
      const track = () => {
        if (subscribed && userId) void ch.track({ ...meta }).catch(() => {})
      }
      if (userId) {
        room = {
          state: () => ch.presenceState() as ReturnType<PresenceRoom['state']>,
          onSync(cb) {
            syncs.add(cb)
            return () => {
              syncs.delete(cb)
            }
          },
          setMeta(patch) {
            Object.assign(meta, patch, { user_id: userId })
            track()
          },
        }
        rooms.set(topic, room)
        roomsChanged()
      }
      await supabase.realtime.setAuth()
      if (cancelled) return
      ch.subscribe((status) => {
        subscribed = status === 'SUBSCRIBED'
        track()
      })
    })()
    return () => {
      cancelled = true
      if (room && rooms.get(topic) === room) {
        rooms.delete(topic)
        roomsChanged()
      }
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
