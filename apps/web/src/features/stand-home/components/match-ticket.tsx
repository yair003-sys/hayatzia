'use client'

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, MessageCircle } from 'lucide-react'
import type { DisplayTeam } from '@/features/matches/api-teams'
import { kickoffDay, kickoffTime } from '@/features/matches/format'
import { DONE_STATUSES, type Fixture } from '@/features/matches/schema'
import { CLOSE_AFTER_MIN, MATCH_MIN, OPEN_BEFORE_MIN, roomState } from '@/features/match-room/schema'
import { isTicketLive, minuteLabel, untilLabel } from '../schema'
import { ticketFixtureAction } from '../server/actions'
import { usePresence } from './presence'

const MIN = 60_000

/** Legacy "יום משחק" ticket: live minute, score rows, and a footer that follows the match room's state. */
export function MatchTicket({ fixture: initial, home, away }: { fixture: Fixture; home: DisplayTeam; away: DisplayTeam }) {
  const [f, setF] = useState(initial)
  const [now, setNow] = useState(() => Date.now())
  const room = roomState(f.t, now)
  const live = isTicketLive(f, now)
  const active = room === 'open' || room === 'closing'
  const inRoom = usePresence(active ? `room:${f.id}` : null)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(tick)
  }, [])
  // While the match is live, re-read just this match (cached league data) for the score once a minute.
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => {
      void ticketFixtureAction({ fixtureId: f.id }).then((r) => {
        if (r.data?.fixture) setF(r.data.fixture)
      })
    }, 60_000)
    return () => clearInterval(t)
  }, [live, f.id])

  const kick = f.t * 1000
  const started = now >= kick || DONE_STATUSES.has(f.st)
  return (
    <Link href={`/matches/${f.id}`} className="sh-tk" data-live={live}>
      <div className="sh-tk-h">
        {live ? (
          <span className="lv">
            <i className="sh-live-dot" aria-hidden="true" />
            {minuteLabel(f, now)}
          </span>
        ) : started ? (
          <span>הסתיים</span>
        ) : (
          <span>
            {kickoffTime(f.t)} · {kickoffDay(f.t)}
          </span>
        )}
        {f.dm && <span className="sh-tag">משחק לדוגמה</span>}
        <span className="sh-tag mine">הקבוצה שלך</span>
      </div>
      <div className="sh-tk-b">
        {[
          { t: home, g: f.gh },
          { t: away, g: f.ga },
        ].map(({ t, g }) => (
          <div key={t.id} className="sh-ln">
            <span className="sh-scarf" style={{ '--a': t.bg, '--b': t.ring } as CSSProperties} aria-hidden="true" />
            <span className="nm">{t.name}</span>
            <span className="sc">{started ? (g ?? 0) : ''}</span>
          </div>
        ))}
      </div>
      <div className="sh-tk-f" data-state={room}>
        {room === 'open' && (
          <>
            <MessageCircle className="size-4" aria-hidden="true" />
            הצ׳אט פתוח
            {inRoom !== null && <span className="n">{inRoom.toLocaleString('he-IL')} אוהדים בחדר</span>}
            <ChevronLeft className={inRoom === null ? 'ms-auto size-4' : 'size-4'} aria-hidden="true" />
          </>
        )}
        {room === 'closing' && <>הצ׳אט נסגר בעוד {untilLabel(kick + (MATCH_MIN + CLOSE_AFTER_MIN) * MIN - now)}</>}
        {room === 'soon' && <>הצ׳אט ייפתח בעוד {untilLabel(kick - OPEN_BEFORE_MIN * MIN - now)}</>}
        {room === 'closed' && <>הצ׳אט נסגר · אפשר לקרוא</>}
      </div>
    </Link>
  )
}
