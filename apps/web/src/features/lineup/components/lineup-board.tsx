import type { CSSProperties } from 'react'
import { formationSlots, labelWidth, SLOT_HE, type Formation } from '../schema'

export type BoardCell = { number: number | null; name: string; pct?: number; rating?: number } | null

/**
 * A read-only XI on the match page's half-pitch (same look and coordinates as the real line-up): a disc with the shirt
 * number, the name, and optionally the fans' percent for that slot and the fans' match rating.
 */
export function LineupBoard({ formation, cells, colours, label }: { formation: Formation; cells: BoardCell[]; colours: { bg: string; ring: string }; label: string }) {
  const spots = formationSlots(formation)
  const style = { '--a': colours.bg, '--b': colours.ring, '--t': colours.ring } as CSSProperties
  return (
    <>
      <div className="lc-pitch" style={style} role="img" aria-label={label}>
        <i className="lc-pitch-arc" />
        <i className="lc-pitch-box" />
        <i className="lc-pitch-six" />
        {spots.map((s) => {
          const c = cells[s.slot] ?? null
          return (
            <span key={s.slot} className="lc-p lu-cell" data-empty={c ? undefined : ''} style={{ left: `${s.x}%`, bottom: `${s.y}%`, maxWidth: `${labelWidth(s)}%` }}>
              <i>{c ? (c.number ?? '') : ''}</i>
              <small>{c ? c.name : SLOT_HE[s.role]}</small>
              {c?.pct !== undefined && <b className="lu-pct t-num">{c.pct}%</b>}
              {c?.rating !== undefined && <b className="lu-rate t-num">★ {c.rating.toFixed(1)}</b>}
            </span>
          )
        })}
      </div>
      <ul className="sr-only" aria-label={`${label}, שחקן אחר שחקן`}>
        {spots.map((s) => {
          const c = cells[s.slot] ?? null
          const extra = [c?.pct !== undefined ? `${c.pct}% מהאוהדים` : null, c?.rating !== undefined ? `דירוג ${c.rating.toFixed(1)}` : null]
          return <li key={s.slot}>{c ? [SLOT_HE[s.role], c.name, ...extra].filter(Boolean).join(', ') : `${SLOT_HE[s.role]}: ריק`}</li>
        })}
      </ul>
    </>
  )
}
