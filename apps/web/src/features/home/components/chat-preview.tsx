'use client'

import { useEffect, useRef, useState } from 'react'
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
      <h2 id="hm-chat-h" className="hm-h2">
        עכשיו בצ׳אט של האוהדים
      </h2>
      {msgs.length === 0 ? (
        <p className="hm-empty">הצ׳אט שקט כרגע — כתוב את ההודעה הראשונה</p>
      ) : (
        <ul className="space-y-2.5">
          {msgs.map((m) => (
            <li key={m.id} className="hm-msg">
              <span className="hm-av" aria-hidden="true">
                {initialOf(m.nick)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="hm-msg-by">{m.nick}</span>
                <span className="hm-msg-body">{m.body}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/stand/chat" className="hm-join">
        הצטרף לשיחה
      </Link>
    </section>
  )
}
