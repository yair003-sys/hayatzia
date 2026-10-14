import Link from 'next/link'
import type { StripDay } from '../live'

/** Seven days as round chips (earliest on the right in RTL); each links to `?d=`. Today in the accent colour, a dot when there are games. */
export function DayStrip({ days, selected, todayKey }: { days: StripDay[]; selected: string; todayKey: string }) {
  return (
    <nav className="lc-dates" aria-label="בחירת יום">
      {days.map((d) => {
        const isToday = d.key === todayKey
        const on = d.key === selected
        const label = `${isToday ? 'היום, ' : ''}יום ${d.weekday} ${d.day}.${Number(d.key.slice(5, 7))}${d.hasGames ? ', יש משחקים' : ''}`
        return (
          <Link
            key={d.key}
            href={`/matches?d=${d.key}`}
            scroll={false}
            replace
            className="lc-d"
            data-on={on}
            data-today={isToday}
            aria-current={on ? 'date' : undefined}
            aria-label={label}
          >
            {d.weekday}
            <b>{d.day}</b>
            <i data-dot={d.hasGames} aria-hidden="true" />
          </Link>
        )
      })}
    </nav>
  )
}
