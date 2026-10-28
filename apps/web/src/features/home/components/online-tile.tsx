'use client'

import { useTranslations } from 'next-intl'
import { useOnlineCount } from '@/features/stand-home/components/presence'

/** "מחוברים עכשיו": the club's Realtime presence count (tracked once per app by OnlineTracker), live; no live region (it changes too often to announce). */
export function OnlineTile() {
  const t = useTranslations('home')
  const online = useOnlineCount()
  return (
    <div className="hm-tile">
      <span className="hm-dot" aria-hidden="true">
        <i />
      </span>
      <span className="hm-tile-txt">
        {online === null ? (
          // Presence not connected yet: a placeholder of the number's size, so nothing moves when it arrives.
          <span className="skeleton my-0.5 block h-5 w-10 rounded" aria-hidden="true" />
        ) : (
          <b className="t-num">{online.toLocaleString('he-IL')}</b>
        )}
        <span>{t('onlineNow')}</span>
      </span>
    </div>
  )
}
