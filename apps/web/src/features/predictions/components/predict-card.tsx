import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { currentRoundIndex, groupByRound } from '@/features/matches/rounds'
import { getLeague } from '@/features/matches/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getBoard, getMyGuesses } from '../server/queries'

const clock = () => Date.now()

/** Top of the Matches tab: open guesses left in the round, my season points and place in my club. */
export async function PredictCard() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const league = await getLeague()
  if (!league) return null
  const rounds = groupByRound(league.fixtures)
  const open = (rounds[currentRoundIndex(rounds)]?.fixtures ?? []).filter((f) => f.t * 1000 > clock())
  const [mine, board] = await Promise.all([getMyGuesses(open.map((f) => f.id)), getBoard(s.team.id, league.league.season, s.userId)])
  const left = open.filter((f) => !mine[f.id]).length
  return (
    <Link href="/matches/predict" className="sh-card">
      <span className="sh-card-h">
        <span className="text-lg" aria-hidden="true">
          🔮
        </span>
        <b>ניחושים</b>
        <span className={left > 0 ? 'sh-chip open' : 'sh-chip'}>{open.length === 0 ? 'אין משחקים פתוחים' : left > 0 ? `${left} פתוחים` : 'ניחשת הכול'}</span>
        <ChevronLeft className="size-4 text-dim" aria-hidden="true" />
      </span>
      <span className="sh-pv">
        {board.mine ? (
          <>
            <b>{board.mine.points} נק׳</b> · מקום {board.mine.rank} באוהדי {s.team.short}
          </>
        ) : (
          '3 נקודות על תוצאה מדויקת, נקודה על כיוון. טבלת מנחשים עונתית.'
        )}
      </span>
    </Link>
  )
}
