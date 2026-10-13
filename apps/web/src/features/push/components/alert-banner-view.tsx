'use client'

import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { MessageCircle, X } from 'lucide-react'
import type { TeamAccent } from '@/features/stand-home/schema'

export type ShownBanner = {
  /** Grows with every banner, so a newer one replaces (and re-animates) the older. */
  seq: number
  title: string
  body: string
  href: string
  tone: 'match' | 'message'
  /** The scoring club's colours; null → the neutral brand style. */
  accent: TeamAccent | null
}

/** Sideways distance that dismisses. */
const SWIPE_PX = 64

type Drag = { id: number; x: number; y: number; dx: number; horizontal: boolean | null }

/**
 * The banner itself (pure view). A polite live region that is always present; the card is a real link (tap opens
 * the target), with a close button; Escape or a sideways swipe dismisses. Hover or focus holds it on screen.
 */
export function BannerView({
  banner,
  onOpen,
  onDismiss,
  onHold,
}: {
  banner: ShownBanner | null
  onOpen: (href: string) => void
  onDismiss: () => void
  onHold?: (held: boolean) => void
}) {
  const drag = useRef<Drag | null>(null)
  const swiped = useRef(false)

  const reset = (el: HTMLElement) => {
    el.style.transform = ''
    el.style.opacity = ''
    el.removeAttribute('data-dragging')
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    swiped.current = false
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, horizontal: null }
  }

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (d.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) {
      d.horizontal = Math.abs(dx) > Math.abs(dy)
      if (d.horizontal) {
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId)
        } catch {
          // not supported here; the swipe still works while the pointer stays on the card
        }
      }
    }
    if (!d.horizontal) return
    d.dx = dx
    const el = e.currentTarget
    el.setAttribute('data-dragging', '')
    el.style.transform = `translateX(${dx}px)`
    el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 240))
  }

  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId) return
    if (d.horizontal && Math.abs(d.dx) >= SWIPE_PX) {
      swiped.current = true // the click that follows this pointerup must not open the target
      onDismiss()
      return
    }
    if (d.horizontal) swiped.current = true
    reset(e.currentTarget)
  }

  const cancel = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null
    reset(e.currentTarget)
  }

  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return // let the browser open a new tab or window
    e.preventDefault()
    if (swiped.current) {
      swiped.current = false
      return
    }
    if (banner) onOpen(banner.href)
  }

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onDismiss()
    }
  }

  const style = banner?.accent
    ? ({ '--ab-bg': banner.accent.accent, '--ab-bg2': banner.accent.accent2, '--ab-on': banner.accent.on } as CSSProperties)
    : undefined

  return (
    <div className="ab-wrap" role="status" aria-live="polite">
      {banner && (
        <div
          key={banner.seq}
          className="ab"
          data-tone={banner.tone}
          data-team={banner.accent ? '' : undefined}
          style={style}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onKeyDown={key}
          onMouseEnter={() => onHold?.(true)}
          onMouseLeave={() => onHold?.(false)}
          onFocus={() => onHold?.(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHold?.(false)
          }}
        >
          <a href={banner.href} className="ab-main" onClick={open} draggable={false}>
            {banner.tone === 'message' && (
              <span className="ab-icon" aria-hidden="true">
                <MessageCircle className="size-4" strokeWidth={2.4} />
              </span>
            )}
            <span className="ab-text">
              <span className="ab-title">{banner.title}</span>
              {banner.body && <span className="ab-body">{banner.body}</span>}
            </span>
          </a>
          <button type="button" className="ab-close" aria-label="סגירת ההתראה" onClick={onDismiss}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
