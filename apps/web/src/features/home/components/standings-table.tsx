'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

export type StandRow = { team: number; rank: number; short: string; bg: string; ring: string; p: number; pts: number; mine: boolean }

/**
 * The home table. Collapsed it shows a three-row window around the fan's club; "הטבלה המלאה" opens the whole table
 * right here, on the same page (owner 2026-10-18), and "הצג פחות" closes it again. No navigation — the full standings
 * are already on the client, so the toggle is instant and the page never scrolls sideways.
 */
export function StandingsTable({ rows }: { rows: StandRow[] }) {
  const t = useTranslations('home')
  const [open, setOpen] = useState(false)
  const i = rows.findIndex((r) => r.mine)
  const start = i < 0 ? 0 : Math.max(0, Math.min(i - 1, rows.length - 3))
  const shown = open ? rows : rows.slice(start, start + 3)
  const canOpen = rows.length > shown.length || open
  return (
    <>
      <table className="hm-table">
        <colgroup>
          <col style={{ width: 40 }} />
          <col />
          <col style={{ width: 48 }} />
          <col style={{ width: 52 }} />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">{t('rankCol')}</th>
            <th scope="col">{t('teamCol')}</th>
            <th scope="col">{t('playedCol')}</th>
            <th scope="col">{t('pointsCol')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.team} data-mine={r.mine} aria-current={r.mine ? 'true' : undefined}>
              <td className="t-num">{r.rank}</td>
              <td>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="hm-tdot" style={{ '--a': r.bg, '--b': r.ring } as CSSProperties} aria-hidden="true" />
                  <span className="truncate">{r.short}</span>
                </span>
              </td>
              <td className="t-num text-muted">{r.p}</td>
              <td className="t-num font-bold">{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canOpen && (
        <button type="button" className="hm-table-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t('showLess') : t('fullTable')}
        </button>
      )}
    </>
  )
}
