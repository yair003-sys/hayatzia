'use client'

import { useEffect, useRef, useState } from 'react'
import { usePresenceRoom, type PresenceRoom } from '@/features/stand-home/components/presence'
import { whileVisible } from '@/lib/while-visible'
import { countTyping, createTypingSignal } from '../typing'

type Signal = ReturnType<typeof createTypingSignal>

/**
 * Typing in a public chat, over the presence channel the page already tracks on `presenceTopic` (`online:<club>` for
 * the club chat, `room:<fixture>` for the match room): no extra channel, no database write. Returns how many other
 * fans are typing, and the composer's hooks. Only while the page is visible.
 */
export function useTyping(presenceTopic: string | undefined, meId: string, hiddenUsers: readonly string[] | undefined) {
  const room = usePresenceRoom(presenceTopic)
  const [seen, setSeen] = useState<{ room: PresenceRoom; n: number } | null>(null)
  const signal = useRef<Signal | null>(null)
  const hiddenKey = hiddenUsers?.join('\n') ?? ''

  useEffect(() => {
    if (!room) return
    const hidden = hiddenKey ? hiddenKey.split('\n') : []
    const stop = whileVisible(() => {
      const sig = createTypingSignal((typing) => room.setMeta({ typing }))
      signal.current = sig
      const recount = () => setSeen({ room, n: countTyping(room.state(), meId, hidden) })
      const first = setTimeout(recount, 0)
      const off = room.onSync(recount)
      return () => {
        clearTimeout(first)
        off()
        sig.dispose()
        if (signal.current === sig) signal.current = null
        setSeen(null)
      }
    })
    return () => {
      stop()
    }
  }, [room, meId, hiddenKey])

  return {
    count: seen && seen.room === room ? seen.n : 0,
    /** A keystroke in the composer (with text in it). */
    onInput: () => signal.current?.input(),
    /** Sent, left the box, or emptied it. */
    onStop: () => signal.current?.stop(),
  }
}
