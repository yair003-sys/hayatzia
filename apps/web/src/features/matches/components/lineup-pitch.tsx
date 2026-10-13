'use client'

import { useState, type CSSProperties } from 'react'
import type { DisplayTeam } from '../api-teams'
import { pitchSpots } from '../live'
import type { FixtureDetail } from '../schema'
import { Crest } from './crest'

type Lineup = FixtureDetail['lu'][number]
type SideTeam = Pick<DisplayTeam, 'name' | 'short' | 'bg' | 'ring'>
export type PitchSide = { key: 'home' | 'away'; team: SideTeam; lu: Lineup | null }

const NOT_YET = 'ההרכבים יפורסמו לפני המשחק'
const POS_HE: Record<string, string> = { G: 'שוער', D: 'הגנה', M: 'קישור', F: 'התקפה' }

/** "E. Zahavi" → "Zahavi": the pitch has room for a surname only (full name stays in the title). */
const pitchName = (name: string) => name.replace(/^(\p{L}\.\s*)+/u, '') || name

/** The "הרכב" tab: each club's starting XI on a half-pitch (goalkeeper at the bottom), a club switch, the bench below. */
export function LineupPitch({ sides }: { sides: PitchSide[] }) {
  const [key, setKey] = useState<PitchSide['key']>('home')
  if (sides.every((s) => !s.lu)) return <p className="lc-end">{NOT_YET}</p>
  const side = sides.find((s) => s.key === key) ?? sides[0]!
  return (
    <div className="space-y-3">
      <div className="lc-switch" role="group" aria-label="בחירת קבוצה">
        {sides.map((s) => (
          <button key={s.key} type="button" aria-pressed={s.key === side.key} onClick={() => setKey(s.key)}>
            <Crest team={s.team} size="sm" />
            <span>{s.team.short}</span>
          </button>
        ))}
      </div>
      <SideLineup side={side} />
    </div>
  )
}

function SideLineup({ side: { team, lu } }: { side: PitchSide }) {
  if (!lu || (lu.xi.length === 0 && lu.sub.length === 0)) return <p className="lc-end">{NOT_YET}</p>
  const spots = pitchSpots(lu.xi)
  const colours = { '--a': team.bg, '--b': team.ring, '--t': team.ring } as CSSProperties
  return (
    <div className="space-y-3">
      {(lu.f || lu.coach) && (
        <p className="lc-formation">
          <span>
            {team.short}
            {lu.f && (
              <>
                {' · '}
                <bdi className="t-num">{lu.f}</bdi>
              </>
            )}
          </span>
          {lu.coach && (
            <span>
              מאמן: <bdi>{lu.coach}</bdi>
            </span>
          )}
        </p>
      )}
      {spots ? (
        <div className="lc-pitch" style={colours} role="img" aria-label={`ההרכב הפותח של ${team.name}`}>
          <i className="lc-pitch-arc" />
          <i className="lc-pitch-box" />
          <i className="lc-pitch-six" />
          {spots.map((s, i) => (
            <span key={i} className="lc-p" style={{ left: `${s.x}%`, bottom: `${s.y}%` }} title={s.name}>
              <i>{s.n ?? ''}</i>
              <small>{pitchName(s.name)}</small>
            </span>
          ))}
        </div>
      ) : (
        lu.xi.length > 0 && <PlayerList title="הרכב פותח" players={lu.xi} />
      )}
      {lu.sub.length > 0 && <PlayerList title="ספסל" players={lu.sub} />}
    </div>
  )
}

function PlayerList({ title, players }: { title: string; players: { n: number | null; p: string; pos: string }[] }) {
  return (
    <section className="space-y-2">
      <h3 className="lc-list-h">{title}</h3>
      <ul className="lc-list">
        {players.map((pl, i) => (
          <li key={i}>
            <b className="t-num">{pl.n ?? ''}</b>
            <bdi>{pl.p}</bdi>
            {pl.pos && <small>{POS_HE[pl.pos] ?? pl.pos}</small>}
          </li>
        ))}
      </ul>
    </section>
  )
}
