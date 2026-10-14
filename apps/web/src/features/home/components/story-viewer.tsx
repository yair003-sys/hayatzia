'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ClipCard } from '@/features/square/components/clip-card'
import type { Clip } from '@/features/square/schema'

/** A photo stays this long; a video plays to its end. */
export const IMAGE_MS = 6000
const SWIPE_PX = 50

export type ViewerItem = { clip: Clip; group: number }

type Props = {
  items: ViewerItem[]
  start: number
  meId: string
  myTeamId: string
  label: string
  /** Called for every clip that comes on screen (the opener records the first one itself). */
  onSeen: (id: string) => void
  onClose: () => void
}

/**
 * Full-screen stories: the Square's own post card (media, ♥, comments, report) one clip at a time, with progress bars
 * for the fan's clips. Next: tap the end side (left in RTL), swipe right, or ←. Back: the start side, swipe left, or →.
 * Swipe down or Escape closes. Holding a finger down, typing a comment or leaving the page pauses a photo.
 */
export function StoryViewer({ items, start, meId, myTeamId, label, onSeen, onClose }: Props) {
  const [index, setIndex] = useState(start)
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set())
  const [progress, setProgress] = useState(0)
  const [held, setHeld] = useState(false)
  const [typing, setTyping] = useState(false)
  const [hidden, setHidden] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const timer = useRef({ id: '', left: IMAGE_MS })
  const cur = items[index]
  const paused = held || typing || hidden

  /** Move to the next clip not removed meanwhile, in direction `dir`; past the end closes, before the start restarts. */
  const go = useCallback(
    (dir: 1 | -1) => {
      let to = index + dir
      while (to >= 0 && to < items.length && removed.has(items[to]?.clip.id ?? '')) to += dir
      const next = items[to]
      if (to >= items.length || !next) return onClose()
      if (to < 0) return
      setIndex(to)
      setProgress(0)
      onSeen(next.clip.id)
    },
    [index, items, removed, onClose, onSeen],
  )

  // A photo (or a post whose media could not load) moves on by itself; pausing keeps the time left.
  useEffect(() => {
    if (!cur || paused || (cur.clip.kind === 'video' && cur.clip.url)) {
      return
    }
    if (timer.current.id !== cur.clip.id) timer.current = { id: cur.clip.id, left: IMAGE_MS }
    const startedAt = Date.now()
    const t = setTimeout(() => go(1), timer.current.left)
    return () => {
      clearTimeout(t)
      timer.current.left = Math.max(0, timer.current.left - (Date.now() - startedAt))
    }
  }, [cur, paused, go])

  // Modal: focus inside on open, keys, Tab stays inside, focus back to the circle on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLElement && e.target.matches('input, textarea')
      if (e.key === 'Escape') return onClose()
      if (!inField && e.key === 'ArrowLeft') return go(1)
      if (!inField && e.key === 'ArrowRight') return go(-1)
      if (e.key !== 'Tab' || !root.current) return
      const all = [...root.current.querySelectorAll<HTMLElement>('button, input, textarea, a[href]')].filter((el) => !el.hasAttribute('disabled'))
      const first = all[0]
      const last = all.at(-1)
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    const onVisibility = () => {
      setHidden(document.visibilityState === 'hidden')
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      opener?.focus()
    }
  }, [go, onClose])

  // The page under the viewer does not scroll.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const onPointerDown = (e: ReactPointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY }
    swiped.current = false
    setHeld(true)
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    setHeld(false)
    const d = down.current
    down.current = null
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (dy > 2 * SWIPE_PX && dy > Math.abs(dx)) {
      swiped.current = true
      return onClose()
    }
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true
      go(dx > 0 ? 1 : -1) // RTL: the next story comes in from the left
    }
  }
  const tap = (dir: 1 | -1) => () => {
    if (swiped.current) return
    go(dir)
  }

  if (!cur) return null
  const group = items.filter((i) => i.group === cur.group && !removed.has(i.clip.id))
  const at = group.findIndex((i) => i.clip.id === cur.clip.id)
  const isVideo = cur.clip.kind === 'video' && cur.clip.url !== null

  return createPortal(
    <div
      ref={root}
      className="hm-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setHeld(false)}
      onFocus={(e) => setTyping(e.target.matches('input, textarea'))}
      onBlur={() => setTyping(false)}
    >
      <div className="absolute inset-0">
        <ClipCard
          key={cur.clip.id}
          clip={cur.clip}
          meId={meId}
          myTeamId={myTeamId}
          onRemoved={(id) => {
            setRemoved((r) => new Set(r).add(id))
            go(1)
          }}
          story={{ onEnded: () => go(1), onProgress: setProgress }}
        />
      </div>
      <button type="button" className="hm-viewer-tap" data-side="start" aria-label="הסטורי הקודם" onClick={tap(-1)} />
      <button type="button" className="hm-viewer-tap" data-side="end" aria-label="הסטורי הבא" onClick={tap(1)} />
      <div className="hm-viewer-top">
        <div className="hm-bars" aria-hidden="true">
          {group.map((g, i) => (
            <span key={g.clip.id} className="hm-bar">
              {i < at && <i style={{ width: '100%' }} />}
              {i === at &&
                (isVideo ? (
                  <i style={{ width: `${Math.round(progress * 100)}%` }} />
                ) : (
                  <i key={cur.clip.id} className="hm-bar-run" style={{ animationDuration: `${IMAGE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
                ))}
            </span>
          ))}
        </div>
        <button ref={closeBtn} type="button" className="hm-viewer-close" aria-label="סגור" onClick={onClose}>
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
