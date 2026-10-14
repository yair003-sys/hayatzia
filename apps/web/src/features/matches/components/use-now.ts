'use client'

import { useSyncExternalStore } from 'react'

// One shared 30-second clock for every live card and tile on the page.
// The server snapshot is null, so prerendered HTML never contains a clock reading (no hydration mismatch).
const TICK_MS = 30_000
let now = 0
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      for (const l of listeners) l()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot(): number {
  if (now === 0) now = Date.now()
  return now
}

const getServerSnapshot = () => null

/** Current time in ms on the client (ticks every 30 s); null while prerendering and during hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
