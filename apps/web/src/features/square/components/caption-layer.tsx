'use client'

import { useRef } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { ClipCaption } from '../schema'

const SIZE_MIN = 0.8
const SIZE_MAX = 3

/**
 * The styled text overlays on a clip, positioned by percentage so they hold at any size. Read-only on playback; in the
 * editor (`onMove` set) each caption can be dragged with one finger, pinched with two to resize (like TikTok/Instagram),
 * and a short tap (no drag/pinch) opens its editor via `onEdit`. Font size scales with the clip width (container query
 * units), so a caption looks the same on the small preview and the full feed.
 */
export function CaptionLayer({
  captions,
  selected = null,
  onSelect,
  onMove,
  onScale,
  onEdit,
}: {
  captions: ClipCaption[]
  selected?: number | null
  onSelect?: (i: number) => void
  onMove?: (i: number, x: number, y: number) => void
  onScale?: (i: number, size: number) => void
  onEdit?: (i: number) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const editable = !!onMove
  // Active pointers on the caption being handled, plus the one-finger drag start and the two-finger pinch baseline.
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef({ x: 0, y: 0 })
  const moved = useRef(false)
  const pinch = useRef<{ dist: number; size: number } | null>(null)

  const spread = () => {
    const [a, b] = [...pts.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  const down = (i: number) => (e: ReactPointerEvent) => {
    if (!editable) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 1) {
      onSelect?.(i)
      moved.current = false
      start.current = { x: e.clientX, y: e.clientY }
    } else if (pts.current.size === 2) {
      // Second finger down → start a pinch-to-resize from the current size.
      pinch.current = { dist: spread(), size: captions[i]?.size ?? 1.4 }
      moved.current = true
    }
  }

  const move = (i: number) => (e: ReactPointerEvent) => {
    if (!editable || !root.current || !pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Two fingers: resize, don't reposition.
    if (pinch.current && pts.current.size >= 2) {
      const d = spread()
      if (pinch.current.dist > 0 && onScale) {
        const next = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(pinch.current.size * (d / pinch.current.dist) * 10) / 10))
        onScale(i, next)
      }
      return
    }
    // One finger: drag once it has moved past a small threshold (so a tap still opens the editor).
    const p = pts.current.get(e.pointerId)
    if (!p) return
    if (!moved.current && Math.hypot(p.x - start.current.x, p.y - start.current.y) < 6) return
    moved.current = true
    const box = root.current.getBoundingClientRect()
    const x = Math.max(4, Math.min(96, ((p.x - box.left) / box.width) * 100))
    const y = Math.max(6, Math.min(94, ((p.y - box.top) / box.height) * 100))
    onMove?.(i, Math.round(x), Math.round(y))
  }

  const up = (i: number) => (e: ReactPointerEvent) => {
    pts.current.delete(e.pointerId)
    if (pts.current.size < 2) pinch.current = null
    if (pts.current.size === 1) {
      // Lifting one finger of a pinch: keep dragging smoothly from the remaining finger.
      const [rest] = [...pts.current.values()]
      if (rest) start.current = { x: rest.x, y: rest.y }
    }
    if (pts.current.size === 0) {
      if (!moved.current) onEdit?.(i)
      moved.current = false
    }
  }

  return (
    <div ref={root} className="cap-layer" aria-hidden={!editable}>
      {captions.map((c, i) => (
        <span
          key={i}
          className={cn('cap', `cap--${c.style}`, editable && 'cap--edit', editable && selected === i && 'cap--sel')}
          style={{ left: `${c.x}%`, top: `${c.y}%`, '--c': c.color, '--s': c.size } as CSSProperties}
          onPointerDown={editable ? down(i) : undefined}
          onPointerMove={editable ? move(i) : undefined}
          onPointerUp={editable ? up(i) : undefined}
          onPointerCancel={editable ? up(i) : undefined}
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
        >
          {c.text}
        </span>
      ))}
    </div>
  )
}
