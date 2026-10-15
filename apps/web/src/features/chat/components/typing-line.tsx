'use client'

import { useEffect, useRef, useState } from 'react'
import { createThrottle, TYPING_ANNOUNCE_MS, typingLabel } from '../typing'

/**
 * "N אוהדים כותבים…" with three dots, just above the chat box. The visible line changes live; screen readers hear it
 * through a polite live region at most every 10 s (the count can change every second in a busy room).
 */
export function TypingLine({ count }: { count: number }) {
  const label = typingLabel(count)
  const [said, setSaid] = useState('')
  const announcer = useRef<ReturnType<typeof createThrottle<string>> | null>(null)

  useEffect(() => {
    const t = createThrottle<string>(setSaid, TYPING_ANNOUNCE_MS, '')
    announcer.current = t
    return () => {
      t.dispose()
      announcer.current = null
    }
  }, [])
  useEffect(() => {
    announcer.current?.set(label)
  }, [label])

  return (
    <>
      {label && (
        <p className="chat-typing" aria-hidden="true">
          <span className="chat-typing-dots">
            <i />
            <i />
            <i />
          </span>
          {label}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </>
  )
}
