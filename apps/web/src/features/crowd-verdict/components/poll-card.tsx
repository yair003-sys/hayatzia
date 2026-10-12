'use client'

import { useState, useTransition } from 'react'
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

const SOURCE: Record<Poll['source'], string> = { chat: '⚡ דעת הקהל · מהצ׳אט', event: '🟨 אירוע במשחק', schedule: '⏱️ דעת הקהל' }

const press =
  'relative overflow-hidden rounded-xl border border-line bg-surface-2 shadow-[0_3px_0_var(--color-elev)] transition-transform duration-150 active:translate-y-0.5 active:shadow-[0_1px_0_var(--color-elev)] disabled:cursor-default motion-reduce:transition-none'

/** One poll as a compact card inside the match-room chat (mockup v3). */
export function PollCard({ poll, tallies, mine, now, myTeamId, home, away, onVote }: Props) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pickOut, setPickOut] = useState<string | null>(mine?.option ?? null)
  const [splitOpen, setSplitOpen] = useState(false)
  const open = pollState(poll, now) === 'open'
  const voter = canVote(poll, myTeamId, now)
  const reveal = showResults(poll, mine, myTeamId, now)
  const total = resultsFor(poll, tallies, 'o').reduce((a, r) => a + r.n, 0)
  const left = Math.max(0, Math.ceil((Date.parse(poll.closesAt) - now) / 1000))
  const club = poll.scope === home.id ? home : poll.scope === away.id ? away : null

  const send = (option: string, optionIn?: string) =>
    start(async () => {
      setError(await onVote(poll.id, option, optionIn))
    })

  return (
    <article
      id={`poll-${poll.id}`}
      aria-label={poll.question}
      className={cn(
        'my-1 grid gap-2 self-stretch rounded-2xl border bg-surface-3 p-3 motion-safe:animate-pop',
        open ? 'border-accent/50' : 'border-line',
      )}
    >
      <header className="flex items-center gap-2 text-[11px] font-bold text-accent-text">
        <span>{club ? `🔁 רק אוהדי ${club.short}` : SOURCE[poll.source]}</span>
        <span className="ms-auto font-normal text-muted tabular-nums">{open ? `${left} שנ׳` : 'נסגר'}</span>
      </header>
      <h4 className="font-display text-base leading-tight font-black">{poll.question}</h4>

      {poll.kind === 'sub60' ? (
        <>
          <ChipRow
            title="יוצא"
            options={poll.options}
            results={resultsFor(poll, tallies, 'o')}
            reveal={reveal}
            selected={pickOut}
            disabled={!voter || pending}
            onPick={(id) => {
              setPickOut(id)
              if (mine?.optionIn) send(id, mine.optionIn)
            }}
          />
          <ChipRow
            title="נכנס"
            options={poll.optionsIn ?? []}
            results={resultsFor(poll, tallies, 'i')}
            reveal={reveal}
            selected={mine?.optionIn ?? null}
            disabled={!voter || pending || !pickOut}
            onPick={(id) => pickOut && send(pickOut, id)}
          />
          {voter && !mine && <p className="text-[11px] text-muted">בחר מי יוצא ואז מי נכנס</p>}
        </>
      ) : (
        <div className="flex gap-1.5" role="group" aria-label="הצבעה">
          {resultsFor(poll, tallies, 'o').map((r, i) => {
            const o = poll.options[i]!
            const on = mine?.option === o.id
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                disabled={!voter || pending}
                onClick={() => send(o.id)}
                className={cn(press, 'flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 px-1 text-xs font-bold', on && 'border-accent')}
              >
                <span
                  aria-hidden="true"
                  className={cn('absolute inset-y-0 start-0 transition-[width] duration-700', on ? 'bg-accent/30' : 'bg-white/7')}
                  style={{ width: reveal ? `${r.pct}%` : 0 }}
                />
                <span className="relative text-lg leading-none" aria-hidden="true">
                  {o.emoji}
                </span>
                <span className="relative truncate">{o.label}</span>
                {reveal && <span className="relative font-display tabular-nums">{r.pct}%</span>}
              </button>
            )
          })}
        </div>
      )}

      {splitOpen && reveal && poll.kind !== 'sub60' && <Split poll={poll} tallies={tallies} home={home} away={away} />}

      <footer className="flex items-center justify-between gap-2 text-[11px] text-dim">
        <span>
          {poll.summary ??
            `${total.toLocaleString('he-IL')} הצביעו${mine && open ? ' · אפשר לשנות' : voter && !mine ? ' · הצבע כדי לראות תוצאות' : ''}`}
        </span>
        {reveal && poll.kind !== 'sub60' && (
          <button type="button" aria-expanded={splitOpen} onClick={() => setSplitOpen((v) => !v)} className="min-h-8 font-bold text-accent-text">
            {splitOpen ? 'סגור ▴' : 'לפי קבוצה ▾'}
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

function ChipRow(props: {
  title: string
  options: PollOption[]
  results: { option: string; pct: number }[]
  reveal: boolean
  selected: string | null
  disabled: boolean
  onPick: (id: string) => void
}) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] font-bold text-muted">{props.title}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={props.title}>
        {props.options.map((o, i) => {
          const on = props.selected === o.id
          const pct = props.results[i]?.pct ?? 0
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              disabled={props.disabled}
              onClick={() => props.onPick(o.id)}
              className={cn(press, 'flex min-h-9 items-center gap-1.5 px-2 text-xs font-semibold', on && 'border-accent')}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 start-0 bg-warn/15 transition-[width] duration-700"
                style={{ width: props.reveal ? `${pct}%` : 0 }}
              />
              <span className="relative grid size-6 place-items-center rounded-md bg-surface-3 font-display text-[11px] font-black">{o.emoji}</span>
              <span className="relative">{o.label}</span>
              {props.reveal && <span className="relative font-display tabular-nums">{pct}%</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Split({ poll, tallies, home, away }: { poll: Poll; tallies: Tally[]; home: CrowdSide; away: CrowdSide }) {
  const overall = resultsFor(poll, tallies, 'o')
  const leadIndex = overall.reduce((best, r, i) => (r.n > overall[best]!.n ? i : best), 0)
  const lead = poll.options[leadIndex]!
  const rows: { g: Group; name: string; color: string }[] = [
    { g: 'h', name: `אוהדי ${home.short}`, color: home.bar },
    { g: 'a', name: `אוהדי ${away.short}`, color: away.bar },
    { g: 'n', name: 'ניטרליים', color: 'var(--color-dim)' },
  ]
  return (
    <div className="grid gap-1.5 border-t border-line-soft pt-2 text-[11px] text-muted">
      <span>
        כמה אחוז בחרו {lead.emoji} {lead.label}:
      </span>
      {rows.map((row) => {
        const pct = resultsFor(poll, tallies, 'o', row.g)[leadIndex]?.pct ?? 0
        return (
          <div key={row.g} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2">
            <span className="truncate">{row.name}</span>
            <span className="h-1.5 overflow-hidden rounded bg-canvas">
              <span className="block h-full rounded transition-[width] duration-700" style={{ width: `${pct}%`, background: row.color }} />
            </span>
            <b className="text-end text-fg tabular-nums">{pct}%</b>
          </div>
        )
      })}
    </div>
  )
}
