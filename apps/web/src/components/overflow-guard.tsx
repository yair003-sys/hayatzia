'use client'

import { useEffect, useState } from 'react'

// Test builds only (rendered next to EnvBanner): if the page ever becomes wider than the phone screen — the bug that
// made the home page slide sideways on 2026-10-16 — a red bar names it at once, on real data, before it can reach
// production. Never rendered in production.

/** How many pixels the page is wider than the screen; 1px of sub-pixel rounding is not a bug. */
export function overflowPx(scrollWidth: number, clientWidth: number): number {
  const extra = Math.round(scrollWidth - clientWidth)
  return extra > 1 ? extra : 0
}

export function overflowLabel(px: number, culprit: string | null): string {
  return `באג פריסה: הדף רחב מהמסך ב-${px} פיקסלים${culprit ? ` · ${culprit}` : ''}`
}

function clips(el: Element): boolean {
  const ox = getComputedStyle(el).overflowX
  return ox !== 'visible'
}

/** An element outside the page's own box that no clipping box contains (its containing block or above). Measured
 * against the body, not the screen: once the page overflows, a right-to-left page is already shifted sideways. */
function findCulprit(): string | null {
  const page = document.body.getBoundingClientRect()
  let best: { el: Element; out: number } | null = null
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    const out = Math.max(0, page.left - r.left, r.right - page.right)
    if (out <= 1) continue
    const pos = getComputedStyle(el).position
    let inFixed = false
    for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).position === 'fixed') {
        inFixed = true
        break
      }
    }
    if (inFixed) continue
    let cb: Element | null = pos === 'absolute' ? ((el as HTMLElement).offsetParent ?? document.documentElement) : el.parentElement
    let clipped = false
    for (; cb && cb !== document.documentElement; cb = cb.parentElement) {
      if (clips(cb)) {
        clipped = true
        break
      }
    }
    if (!clipped && (!best || out >= best.out)) best = { el, out }
  }
  if (!best) return null
  const cls = typeof best.el.className === 'string' ? best.el.className.trim().split(/\s+/)[0] : ''
  return `${best.el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`
}

export function OverflowGuard() {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const root = document.documentElement
        const px = overflowPx(root.scrollWidth, root.clientWidth)
        if (px === 0) return setLabel(null)
        const culprit = findCulprit()
        console.warn('[onefan] layout overflow', px, culprit)
        setLabel(overflowLabel(px, culprit))
      }, 600)
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', check)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [])
  if (!label) return null
  return (
    <div role="alert" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] bg-live px-3 py-1 text-center text-xs font-bold text-white">
      {label}
    </div>
  )
}
