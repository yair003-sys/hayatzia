import type { ClipFilter } from '@/features/square/schema'

// ONEFAN Video Studio (owner spec 2026-11-28), stage 1. A project is a non-destructive, ordered list of segments:
// each segment points at a source (video/image) and carries a trim window + per-segment speed/filter. Nothing is
// re-encoded until export — exactly like the existing Square, extended from one clip to many.

export const MAX_STUDIO_CLIPS = 10
export const IMAGE_DEFAULT_SEC = 3
/** No segment may be trimmed or split below this (seconds), so a tap never makes a zero-length clip. */
export const MIN_SEG_SEC = 0.3

export type StudioKind = 'video' | 'image'

export type StudioClip = {
  id: string
  sourceId: string
  kind: StudioKind
  /** Object URL / blob URL of the picked source (lives on the device only). */
  url: string
  /** Full length of the source in seconds (an image uses its chosen display length). */
  srcDuration: number
  /** Trim window inside the source, in source seconds. Images keep inSec = 0, outSec = display length. */
  inSec: number
  outSec: number
  speed: number
  filter: ClipFilter
}

export type StudioProject = { id: string; clips: StudioClip[] }

/** How long a segment plays on the timeline (trim window divided by its speed). */
export function segDuration(c: Pick<StudioClip, 'inSec' | 'outSec' | 'speed'>): number {
  return Math.max(0, c.outSec - c.inSec) / (c.speed || 1)
}

/** Total length of the edited video, in seconds. */
export function totalDuration(clips: readonly StudioClip[]): number {
  return clips.reduce((n, c) => n + segDuration(c), 0)
}

/** The segment playing at timeline time `t` (seconds), and the offset into that segment. */
export function clipAt(clips: readonly StudioClip[], t: number): { index: number; offset: number } | null {
  let acc = 0
  for (let i = 0; i < clips.length; i++) {
    const d = segDuration(clips[i]!)
    if (t < acc + d || i === clips.length - 1) return { index: i, offset: Math.max(0, t - acc) }
    acc += d
  }
  return clips.length ? { index: clips.length - 1, offset: 0 } : null
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** A trim with the guards applied (window stays inside the source and never shorter than MIN_SEG_SEC of source). */
export function trimmed(c: StudioClip, inSec: number, outSec: number): StudioClip {
  const lo = clamp(inSec, 0, c.srcDuration - MIN_SEG_SEC)
  const hi = clamp(outSec, lo + MIN_SEG_SEC, c.srcDuration)
  return { ...c, inSec: lo, outSec: hi }
}

/** Split a segment at source time `atSrc`, giving the back half the id `newId`. Returns null if the split is too
 *  close to an edge to leave MIN_SEG_SEC on both sides. */
export function splitClip(c: StudioClip, atSrc: number, newId: string): [StudioClip, StudioClip] | null {
  if (atSrc <= c.inSec + MIN_SEG_SEC || atSrc >= c.outSec - MIN_SEG_SEC) return null
  return [
    { ...c, outSec: atSrc },
    { ...c, id: newId, outSec: c.outSec, inSec: atSrc },
  ]
}
