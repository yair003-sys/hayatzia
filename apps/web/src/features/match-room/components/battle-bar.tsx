'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { battleSplit, leader, type Side } from '../battle'
import type { BattleStore } from './use-battle'

type Team = { id: string; short: string; bar: string }

/**
 * The live "battle bar" over the chat: a tug-of-war that lunges toward whichever crowd is louder right now (every
 * message and every push is a beat), and a big "דחוף" button so a fan can shove it for their side. Home on the right,
 * as in the match row (RTL). Recomputes on each beat and on a 1s tick so the lead fades as beats age. The width glides
 * via a CSS transition; under reduced motion it simply jumps.
 */
export function BattleBar({
  home,
  away,
  mySide,
  store,
}: {
  home: Team
  away: Team
  mySide: Side | null
  store: BattleStore
}) {
  const t = useTranslations('room')
  // The clock lives in state, bumped on each beat and once a second, so the lead fades as beats age — reading
  // Date.now() during render would be an impure call. Starts at 0 (→ a centred 50/50 bar) so server and client match.
  const [now, setNow] = useState(0)
  useEffect(() => {
    const bump = () => setNow(Date.now())
    bump()
    const off = store.subscribe(bump)
    const t = setInterval(bump, 1000)
    return () => {
      off()
      clearInterval(t)
    }
  }, [store])

  const beats = store.beats()
  const homePct = battleSplit(beats, now) // home's share, 8–92
  const lead = leader(beats, now)
  const my = mySide === 'h' ? home : mySide === 'a' ? away : null

  return (
    <section className="rounded-2xl border border-line bg-surface p-3" aria-label={t('battleAria')}>
      <div className="mb-2 flex items-center justify-between text-sm font-extrabold">
        <span className="flex items-center gap-1.5" style={{ color: home.bar }}>
          <i className="size-2.5 rounded-full" style={{ background: home.bar }} aria-hidden="true" />
          {home.short}
          {lead === 'h' && <span aria-label={t('leading')}>🔥</span>}
        </span>
        <span className="text-[11px] font-bold text-muted">{t('whoControls')}</span>
        <span className="flex items-center gap-1.5" style={{ color: away.bar }}>
          {lead === 'a' && <span aria-label={t('leading')}>🔥</span>}
          {away.short}
          <i className="size-2.5 rounded-full" style={{ background: away.bar }} aria-hidden="true" />
        </span>
      </div>
      {/* Track: away fills from the left, home from the right (RTL), meeting at the live split. */}
      <div
        className="flex h-4 overflow-hidden rounded-full"
        role="img"
        aria-label={`${home.short} ${homePct}%, ${away.short} ${100 - homePct}%`}
      >
        <i
          className="h-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
          style={{ width: `${100 - homePct}%`, background: away.bar }}
        />
        <i
          className="h-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
          style={{ width: `${homePct}%`, background: home.bar }}
        />
      </div>
      {my && (
        <button
          type="button"
          onClick={store.push}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl font-extrabold text-white motion-safe:active:scale-[0.97]"
          style={{ background: my.bar }}
        >
          <span aria-hidden="true">🔥</span>
          {t('pushFor', { team: my.short })}
        </button>
      )}
    </section>
  )
}
