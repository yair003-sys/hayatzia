'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { canVote, pollState, resultsFor, showResults, type Group, type MyVote, type Poll, type PollOption, type Tally } from '../schema'

export type CrowdSide = { id: string; short: string; bar: string }

type Props = {
  poll: Poll
  tallies: Tally[]
  mine: MyVote | null
  now: number
  myTeamId: string
  home: CrowdSide
  away: CrowdSide
  onVote: (pollId: string, option: string, optionIn?: string) => Promise<string | null>
}

const pctStyle = (pct: number) => ({ '--pct': pct }) as CSSProperties

/** One poll as a compact, tactile card inside the match-room chat (mockup v3, 3D pass). */
export function PollCard({ poll, tallies, mine, now, myTeamId, home, away, onVote }: Props) {
  const t = useTranslations('live')
  const source: Record<Poll['source'], string> = { chat: t('sourceChat'), event: t('sourceEvent'), schedule: t('sourceSchedule') }
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pickOut, setPickOut] = useState<string | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [burst, setBurst] = useState<{ option: string; n: number } | null>(null)
  const open = pollState(poll, now) === 'open'
  const voter = canVote(poll, myTeamId, now)
  const reveal = showResults(poll, mine, myTeamId, now)
  const total = resultsFor(poll, tallies, 'o').reduce((a, r) => a + r.n, 0)
  const club = poll.scope === home.id ? home : poll.scope === away.id ? away : null
  const out = pickOut ?? mine?.option ?? null

  const send = (option: string, optionIn?: string) => {
    setBurst((b) => ({ option: optionIn ?? option, n: (b?.n ?? 0) + 1 }))
    start(async () => {
      setError(await onVote(poll.id, option, optionIn))
    })
  }

  return (
    <article id={`poll-${poll.id}`} aria-label={poll.question} data-open={open} className="crowd-card my-1.5 grid gap-2.5 self-stretch p-3.5">
      <header className="flex items-center gap-2 text-[11px] font-bold">
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent-text">{club ? t('onlyFansOf', { club: club.short }) : source[poll.source]}</span>
        <span className="ms-auto">{open ? <Countdown poll={poll} now={now} /> : <span className="font-normal text-muted">{t('pollClosed')}</span>}</span>
      </header>
      <h4 className="t-sec">{poll.question}</h4>

      {poll.kind === 'sub60' ? (
        <>
          <ChipRow
            title={t('subOut')}
            options={poll.options}
            results={resultsFor(poll, tallies, 'o')}
            reveal={reveal}
            selected={out}
            disabled={!voter || pending}
            burst={burst}
            onPick={(id) => {
              setPickOut(id)
              if (mine?.optionIn) send(id, mine.optionIn)
            }}
          />
          <ChipRow
            title={t('subIn')}
            options={poll.optionsIn ?? []}
            results={resultsFor(poll, tallies, 'i')}
            reveal={reveal}
            selected={mine?.optionIn ?? null}
            disabled={!voter || pending || !out}
            burst={burst}
            onPick={(id) => out && send(out, id)}
          />
          {voter && !mine && <p className="text-[11px] text-muted">{t('pickOutThenIn')}</p>}
        </>
      ) : (
        <div className="flex gap-2 pb-1" role="group" aria-label={t('voteAria')}>
          {resultsFor(poll, tallies, 'o').map((r, i) => {
            const o = poll.options[i]!
            const on = mine?.option === o.id
            return (
              <div key={o.id} className="relative min-w-0 flex-1">
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!voter || pending}
                  onClick={() => send(o.id)}
                  className="crowd-key flex min-h-[4.6rem] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-bold"
                >
                  <span aria-hidden="true" className="crowd-fill" style={{ width: reveal ? `${r.pct}%` : 0 }} />
                  <span aria-hidden="true" className="crowd-emoji text-[1.65rem]">
                    {o.emoji}
                  </span>
                  <span className="max-w-full truncate">{o.label}</span>
                  {reveal && <span className="crowd-pct text-sm t-num" style={pctStyle(r.pct)} aria-label={`${r.pct}%`} />}
                </button>
                {burst?.option === o.id && <Burst key={burst.n} emoji={o.emoji} />}
              </div>
            )
          })}
        </div>
      )}

      {splitOpen && reveal && poll.kind !== 'sub60' && <Split poll={poll} tallies={tallies} home={home} away={away} />}

      <footer className="flex items-center justify-between gap-2 text-[11px] text-dim">
        <span className={cn(poll.summary && 'font-bold text-fg')}>
          {poll.summary
            ? poll.summary
            : `${t('votedCount', { count: total.toLocaleString('he-IL') })}${mine && open ? t('canChange') : voter && !mine ? t('voteToSee') : ''}`}
        </span>
        {reveal && poll.kind !== 'sub60' && (
          <button type="button" aria-expanded={splitOpen} onClick={() => setSplitOpen((v) => !v)} className="min-h-9 shrink-0 font-bold text-accent-text">
            {splitOpen ? t('closeSplit') : t('bySplit')}
          </button>
        )}
      </footer>
      {error && (
        <p role="alert" className="text-xs text-live">
          {error}
        </p>
      )}
    </article>
  )
}

/** Seconds left, with a ring that drains. */
function Countdown({ poll, now }: { poll: Poll; now: number }) {
  const t = useTranslations('live')
  const total = Math.max(1, Date.parse(poll.closesAt) - Date.parse(poll.opensAt))
  const leftMs = Math.max(0, Date.parse(poll.closesAt) - now)
  const c = 2 * Math.PI * 8
  const low = leftMs < 10_000
  return (
    <span className={cn('flex items-center gap-1.5 font-display tabular-nums', low ? 'text-live' : 'text-muted')}>
      {t('secondsLeft', { n: Math.ceil(leftMs / 1000) })}
      <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--color-line)" strokeWidth="3" />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke={low ? 'var(--color-live)' : 'var(--color-accent-2)'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - leftMs / total)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
    </span>
  )
}

const BURST = Array.from({ length: 9 }, (_, i) => ({ a: `${i * 40 + 10}deg`, r: `${(i % 3) * 40 - 40}deg` }))

/** A short spray of the chosen emoji. */
function Burst({ emoji }: { emoji: string }) {
  return (
    <span className="crowd-burst" aria-hidden="true">
      {BURST.map((b, i) => (
        <i key={i} style={{ '--a': b.a, '--r': b.r, animationDelay: `${(i % 3) * 25}ms` } as CSSProperties}>
          {emoji}
        </i>
      ))}
    </span>
  )
}

function ChipRow(props: {
  title: string
  options: PollOption[]
  results: { option: string; pct: number }[]
  reveal: boolean
  selected: string | null
  disabled: boolean
  burst: { option: string; n: number } | null
  onPick: (id: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[11px] font-bold text-muted">{props.title}</span>
      <div className="flex flex-wrap gap-2 pb-1" role="group" aria-label={props.title}>
        {props.options.map((o, i) => {
          const on = props.selected === o.id
          const pct = props.results[i]?.pct ?? 0
          return (
            <div key={o.id} className="relative">
              <button
                type="button"
                aria-pressed={on}
                disabled={props.disabled}
                onClick={() => props.onPick(o.id)}
                className="crowd-key flex min-h-11 items-center gap-1.5 ps-1.5 pe-2.5 text-xs font-semibold"
              >
                <span aria-hidden="true" className="crowd-fill" style={{ width: props.reveal ? `${pct}%` : 0 }} />
                <span className="grid size-7 place-items-center rounded-lg bg-black/30 t-num text-[11px] shadow-[inset_0_1px_0_rgb(255_255_255/.12)]">
                  {o.emoji}
                </span>
                <span>{o.label}</span>
                {props.reveal && <span className="crowd-pct t-num" style={pctStyle(pct)} aria-label={`${pct}%`} />}
              </button>
              {props.burst?.option === o.id && <Burst key={props.burst.n} emoji="⚽" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Split({ poll, tallies, home, away }: { poll: Poll; tallies: Tally[]; home: CrowdSide; away: CrowdSide }) {
  const t = useTranslations('live')
  const overall = resultsFor(poll, tallies, 'o')
  const leadIndex = overall.reduce((best, r, i) => (r.n > overall[best]!.n ? i : best), 0)
  const lead = poll.options[leadIndex]!
  const rows: { g: Group; name: string; color: string }[] = [
    { g: 'h', name: t('fansOf', { team: home.short }), color: home.bar },
    { g: 'a', name: t('fansOf', { team: away.short }), color: away.bar },
    { g: 'n', name: t('neutrals'), color: 'var(--color-dim)' },
  ]
  return (
    <div className="grid gap-2 border-t border-line-soft pt-2.5 text-[11px] text-muted">
      <span>
        {t('pctChose', { emoji: lead.emoji, label: lead.label })}
      </span>
      {rows.map((row) => {
        const pct = resultsFor(poll, tallies, 'o', row.g)[leadIndex]?.pct ?? 0
        return (
          <div key={row.g} className="grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-2">
            <span className="truncate">{row.name}</span>
            <span className="crowd-bar">
              <span style={{ width: `${pct}%`, backgroundColor: row.color }} />
            </span>
            <b className="crowd-pct text-end font-display text-fg" style={pctStyle(pct)} aria-label={`${pct}%`} />
          </div>
        )
      })}
    </div>
  )
}
