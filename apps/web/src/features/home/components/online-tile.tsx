'use client'

import { useOnlineCount } from '@/features/stand-home/components/presence'

/** "מחוברים עכשיו": the club's Realtime presence count (tracked once per app by OnlineTracker), live; no live region (it changes too often to announce). */
export function OnlineTile() {
  const online = useOnlineCount()
  // Presence not connected (yet, or at all): no tile rather than a dash.
  if (online === null) return null
  return (
    <div className="hm-tile">
      <span className="hm-dot" aria-hidden="true">
        <i />
      </span>
      <span className="hm-tile-txt">
        <b className="t-num">{online.toLocaleString('he-IL')}</b>
        <span>מחוברים עכשיו</span>
      </span>
    </div>
  )
}
