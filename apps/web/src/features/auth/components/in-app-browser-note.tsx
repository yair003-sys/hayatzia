'use client'

import { useSyncExternalStore } from 'react'
import { isInAppBrowser } from '../phone'

const subscribe = () => () => {}

/** Google blocks sign-in inside Instagram/Facebook/TikTok browsers: tell the fan how to get out. */
export function InAppBrowserNote() {
  const inApp = useSyncExternalStore(subscribe, () => isInAppBrowser(navigator.userAgent), () => false)
  if (!inApp) return null
  return (
    <p role="alert" className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
      נראה שפתחת את הקישור מתוך אפליקציה (אינסטגרם, פייסבוק…). גוגל חוסם שם התחברות. לחץ על ⋯ ובחר
      &quot;פתח בדפדפן&quot;. אחר כך חזור לכאן.
    </p>
  )
}
