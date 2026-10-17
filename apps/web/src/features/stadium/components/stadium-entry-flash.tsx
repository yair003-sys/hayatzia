'use client'

import { usePathname } from 'next/navigation'

// Screen-entry swell (stadium redesign, stage 4): a brief light-bloom each time a stadium page is entered. The bloom is
// a fixed, clipped, non-interactive layer, so it can never widen the page at 375px. It keys off the pathname: a new
// path remounts the element, which restarts its one-shot CSS animation that ends at opacity 0 (so it is invisible the
// rest of the time, no state and no timers). prefers-reduced-motion hides it entirely (globals.css).

export function StadiumEntryFlash() {
  const pathname = usePathname()
  return <span key={pathname} className="std-bloom" aria-hidden="true" />
}
