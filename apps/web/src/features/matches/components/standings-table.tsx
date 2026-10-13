import { displayTeam, groupLabelHe } from '../api-teams'
import type { League } from '../schema'

const FORM_COLOR: Record<string, string> = { W: 'bg-ok', D: 'bg-dim', L: 'bg-live' }

export function StandingsTable({ league }: { league: League }) {
  return (
    <div className="space-y-6">
      {league.standings.map((group, gi) => (
        <section key={gi} aria-label={groupLabelHe(group[0]?.grp ?? '')}>
          <h3 className="mb-2 text-sm font-bold text-muted">{groupLabelHe(group[0]?.grp ?? '')}</h3>
          <table className="w-full border-separate border-spacing-y-1 text-sm">
            <thead className="text-xs text-dim">
              <tr>
                <th className="w-6 text-start font-medium">#</th>
                <th className="text-start font-medium">קבוצה</th>
                <th className="w-8 font-medium">מש׳</th>
                <th className="w-10 font-medium">הפרש</th>
                <th className="w-10 font-medium">נק׳</th>
                <th className="hidden w-20 font-medium sm:table-cell">כושר</th>
              </tr>
            </thead>
            <tbody>
              {group.map((row) => {
                const team = displayTeam(row.team, league.teams[String(row.team)]?.name)
                return (
                  <tr key={row.team} className="bg-surface">
                    <td className="rounded-s-md py-2 ps-2 tabular-nums text-muted">{row.rank}</td>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full"
                          style={{ background: team.bg, boxShadow: `0 0 0 2px ${team.ring}` }}
                        />
                        <span className="truncate font-semibold">{team.short}</span>
                      </span>
                    </td>
                    <td className="text-center tabular-nums">{row.p}</td>
                    <td className="text-center tabular-nums" dir="ltr">
                      {row.gd > 0 ? `+${row.gd}` : row.gd}
                    </td>
                    <td className="text-center t-num">{row.pts}</td>
                    <td className="hidden rounded-e-md sm:table-cell">
                      <span className="flex justify-center gap-0.5" aria-label={`כושר: ${row.form}`}>
                        {row.form.split('').map((c, i) => (
                          <i key={i} className={`size-1.5 rounded-full ${FORM_COLOR[c] ?? 'bg-line'}`} />
                        ))}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
