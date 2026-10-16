import 'server-only'
import { displayTeam } from '@/features/matches/api-teams'
import type { League } from '@/features/matches/schema'
import type { MatchOption } from '../components/boards'

/** "מכבי ת״א – הפועל חדרה" for a fixture id ("משחק" when the league data has no such match). */
export function matchLabelOf(league: League | null, fixtureId: number | null): string {
  const f = league?.fixtures.find((x) => x.id === fixtureId)
  if (!f) return 'משחק'
  const home = displayTeam(f.h, league?.teams[String(f.h)]?.name)
  const away = displayTeam(f.a, league?.teams[String(f.a)]?.name)
  return `${home.short} – ${away.short}`
}

/** The club's next matches (from 3 hours ago on), for trips. */
export function upcomingTeamMatches(league: League | null, teamId: string, limit = 6): MatchOption[] {
  const now = Date.now() / 1000
  const day = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' })
  return (league?.fixtures ?? [])
    .filter((f) => f.t > now - 3 * 3600)
    .map((f) => ({ f, home: displayTeam(f.h, league?.teams[String(f.h)]?.name), away: displayTeam(f.a, league?.teams[String(f.a)]?.name) }))
    .filter(({ home, away }) => home.id === teamId || away.id === teamId)
    .slice(0, limit)
    .map(({ f, home, away }) => ({
      id: f.id,
      kickoff: f.t,
      label: `${home.id === teamId ? `נגד ${away.short} (בית)` : `נגד ${home.short} (חוץ)`} · ${day.format(new Date(f.t * 1000))}`,
    }))
}
