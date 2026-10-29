'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { mergeMessages, messageFromBroadcast, type ChatMessage } from '@/features/chat/schema'
import { openChannel } from '@/lib/supabase/channel'
import { createClient } from '@/lib/supabase/client'
import { whileVisible } from '@/lib/while-visible'
import { initialOf } from '../schema'

const SHOWN = 3

/** "עכשיו בצ׳אט של האוהדים": the last 3 club chat messages; new ones slide in live (team:<club> broadcast). */
export function ChatPreview({ teamId, initial, hidden }: { teamId: string; initial: ChatMessage[]; hidden: string[] }) {
  const t = useTranslations('home')
  const [msgs, setMsgs] = useState(initial)
  const hiddenRef = useRef(hidden)
  useEffect(() => {
    hiddenRef.current = hidden
  }, [hidden])
  // Live only while the page is visible (a phone in a pocket holds no socket); back in view it subscribes again.
  useEffect(() => {
    const supabase = createClient()
    const stop = whileVisible(() => {
      let cancelled = false
      let channel: RealtimeChannel | null = null
      void (async () => {
        const ch = await openChannel(supabase, `team:${teamId}`, { private: true })
        if (cancelled) return void supabase.removeChannel(ch)
        channel = ch
        ch.on('broadcast', { event: 'INSERT' }, ({ payload }) => {
          const m = messageFromBroadcast(payload)
          if (m && !hiddenRef.current.includes(m.user_id)) setMsgs((cur) => mergeMessages(cur, [m]).slice(-SHOWN))
        })
        await supabase.realtime.setAuth()
        if (!cancelled) ch.subscribe()
      })()
      return () => {
        cancelled = true
        if (channel) void supabase.removeChannel(channel)
      }
    })
    return () => {
      stop()
    }
  }, [teamId])

  return (
    <section aria-labelledby="hm-chat-h" className="hm-chat">
      <div className="hm-chat-top">
        <h2 id="hm-chat-h" className="hm-h2">
          {t('standChatTitle')}
        </h2>
        <span className="hm-chat-live">
          <i aria-hidden="true" />
          {t('liveNow')}
        </span>
      </div>
      {msgs.length === 0 ? (
        <p className="hm-empty">{t('chatQuiet')}</p>
      ) : (
        <ul className="hm-chat-list">
          {msgs.map((m) => (
            <li key={m.id} className="hm-bubble-row">
              <span className="hm-av" aria-hidden="true">
                {initialOf(m.nick)}
              </span>
              <span className="hm-bubble">
                <span className="hm-msg-by">{m.nick}</span>
                <span className="hm-msg-body">{m.body}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/stand/chat" className="hm-chat-bar" aria-label={t('joinChatAria')}>
        <span className="hm-chat-bar-txt">{t('joinChat')}</span>
        <span className="hm-chat-send" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        </span>
      </Link>
    </section>
  )
}
