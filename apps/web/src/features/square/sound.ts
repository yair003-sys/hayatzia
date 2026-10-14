'use client'

import { useSyncExternalStore } from 'react'

/** One "sound on/off" choice for every video in the Square and the stories: once a fan turns the sound on,
 *  the next videos play with sound too (kept on this phone). Off by default, like Instagram. */
const KEY = 'onefan:sound'
const listeners = new Set<() => void>()
let on: boolean | null = null

function read(): boolean {
  if (on === null) {
    try {
      on = localStorage.getItem(KEY) === '1'
    } catch {
      on = false
    }
  }
  return on
}

export function setSoundOn(next: boolean) {
  on = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
