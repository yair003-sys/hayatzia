'use client'

import { useEffect, type CSSProperties } from 'react'
import { X } from 'lucide-react'

// The big moment (stadium redesign, stage 4): the goal explosion. It is shown only when goalFromChannelEvent reports a
// real goal poll in this match (never a fake button), auto-dismisses, and can be closed. It is a role="alert" live
// region. Under prefers-reduced-motion every animation is off (globals.css) and it reads as a bold static banner.

const AUTO_MS = 6000
const RINGS = [0, 1, 2]
const CONFETTI = Array.from({ length: 28 }, (_, i) => i)

/** One phone-buzz on the goal, guarded for SSR and for phones with no vibrator. Never throws. */
function buzz() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([0, 90, 50, 140, 60, 200])
    }
  } catch {
    // vibration is a nicety; a browser that refuses it changes nothing else
  }
}

type Props = {
  /** The scorer's name when the poll carried it, else null (then just "גוווול!"). */
  scorer: string | null
  /** Fans in the room right now, shown as the celebrating crowd; null hides the line. */
  celebrating: number | null
  /** Close this moment (auto after a few seconds, or on the button). */
  onDismiss: () => void
}

export function GoalOverlay({ scorer, celebrating, onDismiss }: Props) {
  useEffect(() => {
    buzz()
    const t = setTimeout(onDismiss, AUTO_MS)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="std-goal" role="alert" aria-live="assertive">
      <div className="std-goal-rings" aria-hidden="true">
        {RINGS.map((i) => (
          <span key={i} style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
      <div className="std-goal-confetti" aria-hidden="true">
        {CONFETTI.map((i) => (
          <i key={i} data-alt={i % 2} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="std-goal-card">
        <p className="std-goal-word">גוווול!</p>
        {scorer && <p className="std-goal-scorer">{scorer}</p>}
        {celebrating !== null && celebrating > 0 && (
          <p className="std-goal-crowd">
            <b className="std-score">{celebrating.toLocaleString('he-IL')}</b> אוהדים חוגגים עכשיו
          </p>
        )}
      </div>
      <button type="button" className="std-goal-x" onClick={onDismiss} aria-label="סגירת חגיגת הגול">
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}
