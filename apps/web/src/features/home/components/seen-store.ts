'use client'

import { useSyncExternalStore } from 'react'
import { markStorySeenAction } from '../server/actions'

// Posts seen on this page (stories or hot clips), shared by both rows: watching a hot post turns the same fan's story
// ring grey at once. The server already knows what was seen before the page loaded; this adds what happens after.
let seen: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

/** Record a view once per page: the shared set for the rings, and a clip_views row on the server. */
export function markSeen(id: string): void {
  if (seen.has(id)) return
  seen = new Set(seen).add(id)
  for (const l of listeners) l()
  void markStorySeenAction({ clipId: id })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const EMPTY: ReadonlySet<string> = new Set()

export function useSeenNow(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => seen,
    () => EMPTY,
  )
}
