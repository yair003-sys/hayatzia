'use client'

import { useEffect, useState } from 'react'
import { resultsFor, showResults, type MyVote, type Poll, type Tally } from '../schema'

/** Thin bar under the match header while the open poll's card is scrolled out of view; tap jumps back to it. */
export function PinnedStrip(props: { poll: Poll | null; tallies: Tally[]; mine: MyVote | null; myTeamId: string; now: number }) {
  const { poll } = props
  const [hiddenCard, setHiddenCard] = useState(false)

  useEffect(() => {
    const el = poll ? document.getElementById(`poll-${poll.id}`) : null
    if (!el) return
    const io = new IntersectionObserver(([e]) => setHiddenCard(!e?.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [poll])

  if (!poll || !hiddenCard) return null
  const reveal = showResults(poll, props.mine, props.myTeamId, props.now)
  const results = resultsFor(poll, props.tallies, 'o')
  return (
    <button
      type="button"
      onClick={() => document.getElementById(`poll-${poll.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
      className="sticky top-[env(safe-area-inset-top,0px)] z-10 flex min-h-10 w-full items-center gap-2 rounded-xl border border-line bg-[linear-gradient(90deg,var(--color-accent-soft),rgb(255_61_87/.12))] bg-elev px-3 text-start text-sm backdrop-blur"
    >
      <span aria-hidden="true">⚡</span>
      <b className="truncate">{poll.question}</b>
      <span className="ms-auto flex shrink-0 gap-2 font-display text-xs font-bold text-muted tabular-nums">
        {poll.kind === 'sub60' || !reveal
          ? 'הצבע'
          : results.map((r, i) => (
              <span key={r.option}>
                {poll.options[i]!.emoji} {r.pct}%
              </span>
            ))}
      </span>
    </button>
  )
}
