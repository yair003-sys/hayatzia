'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Screen-entry swell (stadium redesign, stage 4): a brief light-bloom each time a stadium page is entered. The bloom is
// a fixed, clipped, non-interactive layer, so it can never widen the page at 375px. It keys off the pathname, mounts
// for ~500ms, then unmounts — nothing animates the rest of the time. prefers-reduced-motion hides it (globals.css).

const BLOOM_MS = 520

export function StadiumEntryFlash() {
  const pathname = usePathname()
  const [on, setOn] = useState(false)

  useEffect(() => {
    setOn(true)
    const t = setTimeout(() => setOn(false), BLOOM_MS)
    return () => clearTimeout(t)
  }, [pathname])

  if (!on) return null
  return <span className="std-bloom" aria-hidden="true" />
}
