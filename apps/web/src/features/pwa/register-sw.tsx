'use client'

import { useEffect } from 'react'

/** Registers the service worker (notifications only). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
    }
  }, [])
  return null
}
