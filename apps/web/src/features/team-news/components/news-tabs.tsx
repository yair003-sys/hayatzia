'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

type Tab = 'chat' | 'news'
const TABS: Tab[] = ['chat', 'news']

/** News | Chat tabs on the chat page. Both panels are rendered and the inactive one is `hidden`, so the chat's realtime
 *  subscription never remounts on a tab switch; `?tab=` follows the choice. The news tab shows an unread dot. */
export function NewsTabs({ initialTab, chat, news, unread }: { initialTab: Tab; chat: ReactNode; news: ReactNode; unread: boolean }) {
  const t = useTranslations('teamNews')
  const [tab, setTab] = useState<Tab>(initialTab)
  const labels: Record<Tab, string> = { chat: t('tabChat'), news: t('tabNews') }
  const panels: Record<Tab, ReactNode> = { chat, news }

  const select = (next: Tab) => {
    setTab(next)
    const params = new URLSearchParams(window.location.search)
    params.set('tab', next)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t('tabNews')} className="lc-tabs">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`nt-tab-${id}`}
            aria-controls={`nt-panel-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            className="lc-tab"
            onClick={() => select(id)}
          >
            {labels[id]}
            {id === 'news' && unread && <span className="ms-1 inline-block size-2 rounded-full bg-accent align-middle" aria-hidden="true" />}
          </button>
        ))}
      </div>
      {TABS.map((id) => (
        <div key={id} role="tabpanel" id={`nt-panel-${id}`} aria-labelledby={`nt-tab-${id}`} hidden={tab !== id}>
          {panels[id]}
        </div>
      ))}
    </div>
  )
}
