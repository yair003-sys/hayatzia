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
const HISTORY_KEY = 'storyViewer'

export type ViewerItem = { clip: Clip; group: number }

type Props = {
  items: ViewerItem[]
  start: number
  meId: string
  myTeamId: string
  label: string
  /** Called for every clip that comes on screen (the opener records the first one itself). */
  onSeen: (id: string) => void
  /** Called once the viewer's history entry is gone (back button, Escape, ✕, swipe down, end of the playlist). */
  onClose: () => void
}

/** The current history state as a plain object (Next keeps its router fields there), without our marker. */
function baseState(): { state: Record<string, unknown>; stale: boolean } {
  const cur = window.history.state
  const state: Record<string, unknown> = cur && typeof cur === 'object' ? { ...(cur as Record<string, unknown>) } : {}
  const stale = HISTORY_KEY in state
  delete state[HISTORY_KEY]
  return { state, stale }
}

/**
 * Full-screen stories: the Square's own post card (media, ♥, comments, report) one clip at a time, with progress bars
 * for the fan's clips. Next: tap the end side (left in RTL), swipe right, or ←. Back: the start side, swipe left, or →
 * (on the first clip it starts over). Swipe down, Escape, ✕ or the phone's back button closes. Holding a finger down,
 * typing a comment or leaving the page pauses (photo timer and video).
 * Same overlay rules as the lineup builder: its own history entry, the page behind inert, scroll locked and restored,
 * focus trapped, and focus back on the opener when it closes.
 */
export function StoryViewer({ items, start, meId, myTeamId, label, onSeen, onClose }: Props) {
  const [index, setIndex] = useState(start)
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set())
  const [progress, setProgress] = useState(0)
  /** Bumped when the current clip starts over (back on the first one). */
  const [round, setRound] = useState(0)
  const [held, setHeld] = useState(false)
  const [typing, setTyping] = useState(false)
  const [hidden, setHidden] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const timer = useRef({ key: '', left: IMAGE_MS })
  // The viewer's own history entry: pushed on open, popped by back (or by leave()), left at most once.
  const pushed = useRef(false)
  const popped = useRef(false)
  const leaving = useRef(false)
  const onCloseRef = useRef(onClose)
  const cur = items[index]
  const paused = held || typing || hidden

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  /** Every way out goes through here: back over our own entry when it is still there, else close directly. */
  const leave = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    if (pushed.current && !popped.current) window.history.back()
    else onCloseRef.current()
  }, [])

  /** Next or previous clip (skipping removed ones). Past the end closes; before the first starts it over. */
  const go = useCallback(
    (dir: 1 | -1) => {
      let to = index + dir
      while (to >= 0 && to < items.length && removed.has(items[to]?.clip.id ?? '')) to += dir
      if (to < 0) {
        setProgress(0)
        setRound((r) => r + 1)
        const v = root.current?.querySelector('video')
        if (v) v.currentTime = 0
        return
      }
      const next = items[to]
      if (!next) return leave()
      setIndex(to)
      setProgress(0)
      onSeen(next.clip.id)
    },
    [index, items, removed, leave, onSeen],
  )
  const goRef = useRef(go)
  useEffect(() => {
    goRef.current = go
  }, [go])

  // A photo (or a post whose media could not load) moves on by itself; pausing keeps the time left.
  useEffect(() => {
    if (!cur || paused || (cur.clip.kind === 'video' && cur.clip.url)) {
      return
    }
    const key = `${cur.clip.id}:${round}`
    if (timer.current.key !== key) timer.current = { key, left: IMAGE_MS }
    const startedAt = Date.now()
    const t = setTimeout(() => goRef.current(1), timer.current.left)
    return () => {
      clearTimeout(t)
      timer.current.left = Math.max(0, timer.current.left - (Date.now() - startedAt))
    }
  }, [cur, paused, round])

  // A video pauses and resumes with the rest (hold, typing, hidden tab).
  useEffect(() => {
    const v = root.current?.querySelector('video')
    if (!v) {
      return
    }
    try {
      if (paused) v.pause()
      else void Promise.resolve(v.play()).catch(() => {})
    } catch {
      // A browser without media playback (tests): nothing to pause.
    }
  }, [paused, cur])

  // Modal, once per opening: own history entry, page behind inert, scroll locked, keys, focus trap. Never re-run on a
  // clip change, so focus stays where the fan put it (the "next" zone, say) and comes back to the circle only on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const scrollY = window.scrollY
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const self = root.current
    const madeInert = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== self && !el.inert)
    for (const el of madeInert) el.inert = true
    const { state, stale } = baseState()
    if (stale) window.history.replaceState(state, '')
    window.history.pushState({ ...state, [HISTORY_KEY]: true }, '')
    pushed.current = true
    popped.current = false
    leaving.current = false
    closeBtn.current?.focus()

    const onPop = () => {
      if (popped.current) return
      popped.current = true
      leaving.current = true
      onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLElement && e.target.matches('input, textarea')
      if (e.key === 'Escape') {
        e.preventDefault()
        return leave()
      }
      if (!inField && e.key === 'ArrowLeft') return goRef.current(1)
      if (!inField && e.key === 'ArrowRight') return goRef.current(-1)
      if (e.key !== 'Tab' || !self) return
      const all = [...self.querySelectorAll<HTMLElement>('button, input, textarea, a[href]')].filter((el) => !el.hasAttribute('disabled'))
      const first = all[0]
      const last = all.at(-1)
      if (!first || !last) return
      if (!self.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const onVisibility = () => {
      setHidden(document.visibilityState === 'hidden')
    }
    window.addEventListener('popstate', onPop)
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const el of madeInert) el.inert = false
      document.body.style.overflow = overflow
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY)
      opener?.focus()
    }
  }, [leave])

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
      return leave()
    }
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true
      go(dx > 0 ? 1 : -1) // RTL: the next story comes in from the left
    }
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
      <button type="button" className="hm-viewer-tap" data-side="start" aria-label="הסטורי הקודם" onClick={() => {
          if (!swiped.current) go(-1)
        }}
      />
      <button type="button" className="hm-viewer-tap" data-side="end" aria-label="הסטורי הבא" onClick={() => {
          if (!swiped.current) go(1)
        }}
      />
      <div className="hm-viewer-top">
        <div className="hm-bars" aria-hidden="true">
          {group.map((g, i) => (
            <span key={g.clip.id} className="hm-bar">
              {i < at && <i style={{ width: '100%' }} />}
              {i === at &&
                (isVideo ? (
                  <i style={{ width: `${Math.round(progress * 100)}%` }} />
                ) : (
                  <i
                    key={`${cur.clip.id}:${round}`}
                    className="hm-bar-run"
                    style={{ animationDuration: `${IMAGE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                  />
                ))}
            </span>
          ))}
        </div>
        <button ref={closeBtn} type="button" className="hm-viewer-close" aria-label="סגור" onClick={leave}>
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
