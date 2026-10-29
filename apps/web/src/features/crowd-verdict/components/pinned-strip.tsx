'use client'

import { useTranslations } from 'next-intl'
import { resultsFor, showResults, type MyVote, type Poll, type Tally } from '../schema'

/** While a poll is open: a pressable button just above the composer; tapping jumps to the poll card. */
export function PinnedStrip(props: { poll: Poll | null; tallies: Tally[]; mine: MyVote | null; myTeamId: string; now: number }) {
  const t = useTranslations('live')
  const { poll } = props
  if (!poll) return null
  const reveal = showResults(poll, props.mine, props.myTeamId, props.now)
  const results = resultsFor(poll, props.tallies, 'o')
  const left = Math.max(0, Math.ceil((Date.parse(poll.closesAt) - props.now) / 1000))
  return (
    <button
      key={poll.id}
      type="button"
      onClick={() => document.getElementById(`poll-${poll.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
      className="crowd-pin flex min-h-11 w-full items-center gap-2 px-3 text-start text-sm"
      aria-label={t('jumpToPoll', { q: poll.question })}
    >
      <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
        <span className="relative size-2.5 rounded-full bg-white" />
      </span>
      <b className="min-w-0 truncate">{poll.question}</b>
      <span className="ms-auto flex shrink-0 items-center gap-2 font-display text-xs font-bold tabular-nums">
        {poll.kind === 'sub60' || !reveal
          ? t('voteNow')
          : results.map((r, i) => (
              <span key={r.option}>
                {poll.options[i]!.emoji} {r.pct}%
              </span>
            ))}
        <span className="rounded-full bg-black/25 px-1.5 py-0.5">{t('secShort', { n: left })}</span>
      </span>
    </button>
  )
}
