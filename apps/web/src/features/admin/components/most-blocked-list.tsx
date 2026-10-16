import type { MostBlockedRow } from '../server/queries'

/**
 * Private messages have no report with content (owner, 2026-10-16: the fan just blocks). The signal for a serial
 * harasser is many different fans blocking the same fan: shown here for the last 30 days (2 or more), counts only.
 * Suspending is done as for any fan ("השעה מכתיבה" on a report about them).
 */
export function MostBlockedList({ rows }: { rows: MostBlockedRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">אין אוהדים שנחסמו על ידי כמה אוהדים בחודש האחרון.</p>
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.user_id} className="flex items-center justify-between gap-3 p-3 text-sm">
          <span className="truncate font-medium">{r.nick || 'אוהד'}</span>
          <span className="shrink-0 text-muted">
            <b className="t-num text-fg">{r.blocked_by}</b> אוהדים חסמו ב־30 יום
          </span>
        </li>
      ))}
    </ul>
  )
}
