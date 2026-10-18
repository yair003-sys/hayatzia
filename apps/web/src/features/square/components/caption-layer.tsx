'use client'

import { useRef } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { ClipCaption } from '../schema'

/**
 * The styled text overlays on a clip, positioned by percentage so they hold at any size. Read-only on playback; in the
 * editor (`onMove` set) each caption can be dragged and tapped to select. Font size scales with the clip width
 * (container query units), so a caption looks the same on the small preview and the full feed.
 */
export function CaptionLayer({
  captions,
  selected = null,
  onSelect,
  onMove,
}: {
  captions: ClipCaption[]
  selected?: number | null
  onSelect?: (i: number) => void
  onMove?: (i: number, x: number, y: number) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const editable = !!onMove

  const startDrag = (i: number) => (e: ReactPointerEvent) => {
    if (!onMove || !root.current) return
    e.preventDefault()
    onSelect?.(i)
    const box = root.current.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      const x = Math.max(4, Math.min(96, ((ev.clientX - box.left) / box.width) * 100))
      const y = Math.max(6, Math.min(94, ((ev.clientY - box.top) / box.height) * 100))
      onMove(i, Math.round(x), Math.round(y))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={root} className="cap-layer" aria-hidden={!editable}>
      {captions.map((c, i) => (
        <span
          key={i}
          className={cn('cap', `cap--${c.style}`, editable && 'cap--edit', editable && selected === i && 'cap--sel')}
          style={{ left: `${c.x}%`, top: `${c.y}%`, '--c': c.color, '--s': c.size } as CSSProperties}
          onPointerDown={editable ? startDrag(i) : undefined}
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
        >
          {c.text}
        </span>
      ))}
    </div>
  )
}
