'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, MessageCircle } from 'lucide-react'
import { mergeMessages, messageFromBroadcast, type ChatMessage } from '@/features/chat/schema'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { openChannel } from '@/lib/supabase/channel'
import { createClient } from '@/lib/supabase/client'

/** Team chat card with the last 3 messages; new messages slide in live. */
export function TeamChatCard({ teamId, short, initial, hidden }: { teamId: string; short: string; initial: ChatMessage[]; hidden: string[] }) {
  const [msgs, setMsgs] = useState(initial)
  const hiddenRef = useRef(hidden)
  useEffect(() => {
    hiddenRef.current = hidden
  }, [hidden])
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    let channel: RealtimeChannel | null = null
    void (async () => {
      const ch = await openChannel(supabase, `team:${teamId}`, { private: true })
      if (cancelled) return void supabase.removeChannel(ch)
      channel = ch
      ch.on('broadcast', { event: 'INSERT' }, ({ payload }) => {
        const m = messageFromBroadcast(payload)
        if (m && !hiddenRef.current.includes(m.user_id)) setMsgs((cur) => mergeMessages(cur, [m]).slice(-3))
      })
      await supabase.realtime.setAuth()
      if (!cancelled) ch.subscribe()
    })()
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [teamId])

  return (
    <Link href="/stand/chat" className="sh-card">
      <span className="sh-card-h">
        <MessageCircle className="size-5" aria-hidden="true" />
        <b>צ׳אט {short}</b>
        <span className="sh-chip open">פתוח תמיד</span>
        <ChevronLeft className="size-4 text-dim" aria-hidden="true" />
      </span>
      {msgs.length === 0 ? (
        <span className="sh-pv">עוד אין הודעות. תהיה הראשון.</span>
      ) : (
        msgs.map((m) => (
          <span key={m.id} className="sh-pv">
            <b>{m.nick}:</b> {m.body}
          </span>
        ))
      )}
    </Link>
  )
}
