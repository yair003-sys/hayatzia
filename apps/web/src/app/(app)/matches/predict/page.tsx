import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { displayTeam, roundLabelHe } from '@/features/matches/api-teams'
import { kickoffDay, kickoffTime } from '@/features/matches/format'
import { currentRoundIndex, groupByRound } from '@/features/matches/rounds'
import { DONE_STATUSES } from '@/features/matches/schema'
import { getLeague } from '@/features/matches/server/queries'
import { GuessRow } from '@/features/predictions/components/guess-row'
import { getBoard, getMyGuesses } from '@/features/predictions/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'ניחושים' }

export default function Page() {
  return (
    <section className="space-y-4">
      <Link href="/matches" className="text-sm text-accent-text">
        → משחקים
      </Link>
      <h1 className="font-display text-3xl font-black">🔮 ניחושים</h1>
      <p className="text-sm text-muted">הניחוש ננעל בשריקת הפתיחה. 3 נקודות על תוצאה מדויקת, נקודה על כיוון נכון.</p>
      <Suspense fallback={<div className="skeleton h-96 rounded-2xl" aria-hidden="true" />}>
        <Predict />
      </Suspense>
    </section>
  )
}

const clock = () => Date.now()

async function Predict() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return <p className="text-muted">צריך להתחבר כדי לנחש.</p>
  const league = await getLeague()
  if (!league) return <p className="text-muted">לא הצלחנו לטעון את המשחקים כרגע.</p>
  const rounds = groupByRound(league.fixtures)
  const round = rounds[currentRoundIndex(rounds)]
  const fixtures = round?.fixtures ?? []
  const now = clock()
  const [mine, board] = await Promise.all([
    getMyGuesses(fixtures.map((f) => f.id)),
    getBoard(s.team.id, league.league.season, s.userId),
  ])
  const team = (id: number) => displayTeam(id, league.teams[String(id)]?.name)
  const shown = board.mine && !board.rows.some((r) => r.me) ? [...board.rows, board.mine] : board.rows

  return (
    <>
      {round && <h2 className="font-display text-xl font-bold">{roundLabelHe(round.key)}</h2>}
      <div className="space-y-3">
        {fixtures.map((f) => (
          <GuessRow
            key={f.id}
            fixtureId={f.id}
            home={team(f.h)}
            away={team(f.a)}
            when={`${kickoffDay(f.t)} ${kickoffTime(f.t)}`}
            locked={now >= f.t * 1000}
            result={DONE_STATUSES.has(f.st) && f.gh !== null && f.ga !== null ? { home: f.gh, away: f.ga } : null}
            initial={mine[f.id] ?? null}
            demo={f.dm}
          />
        ))}
      </div>

      <h2 className="sh-sec">טבלת המנחשים של {s.team.short}</h2>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">עוד אין נקודות העונה. הטבלה תתמלא אחרי המשחקים הראשונים.</p>
      ) : (
        <ol className="space-y-1.5">
          {shown.map((r) => (
            <li key={r.userId} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', r.me ? 'border-accent/60 bg-accent-soft' : 'border-line-soft bg-surface')}>
              <span className="w-6 text-center font-display font-black text-muted tabular-nums">{r.rank}</span>
              <b className="flex-1 truncate">{r.me ? `${r.nick} (אתה)` : r.nick}</b>
              <span className="text-xs text-dim tabular-nums">{r.exact} מדויקים</span>
              <span className="font-display font-black tabular-nums">{r.points} נק׳</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
