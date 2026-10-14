'use client'

import { useOnlineCount } from '@/features/stand-home/components/presence'

/** "מחוברים עכשיו": the club's Realtime presence count (tracked once per app by OnlineTracker), live. */
export function OnlineTile() {
  const online = useOnlineCount()
  return (
    <div className="hm-tile">
      <span className="hm-dot" aria-hidden="true">
        <i />
      </span>
      <span className="hm-tile-txt" aria-live="polite">
        <b className="t-num">{online === null ? '—' : online.toLocaleString('he-IL')}</b>
        <span>מחוברים עכשיו</span>
      </span>
    </div>
  )
}
