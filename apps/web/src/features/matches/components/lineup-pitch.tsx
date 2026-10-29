'use client'

import { useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import type { DisplayTeam } from '../api-teams'
import { type FixtureEvent, type PlayerMark, playerMarks } from '../events'
import { pitchSpots } from '../live'
import type { FixtureDetail } from '../schema'
import { Crest } from './crest'

type Lineup = FixtureDetail['lu'][number]
type SideTeam = Pick<DisplayTeam, 'name' | 'short' | 'bg' | 'ring'>
export type PitchSide = { key: 'home' | 'away'; team: SideTeam; lu: Lineup | null }

type T = ReturnType<typeof useTranslations>
const posLabel = (t: T, pos: string) => (pos ? (t.has(`pos${pos}`) ? t(`pos${pos}`) : pos) : pos)

/** "E. Zahavi" → "Zahavi": the pitch has room for a surname only (full name stays in the title). */
const pitchName = (name: string) => name.replace(/^(\p{L}\.\s*)+/u, '') || name

const hasLineup = (s: PitchSide) => !!s.lu && (s.lu.xi.length > 0 || s.lu.sub.length > 0)

/** The side shown until the fan picks one: the first that has a line-up (home when neither or both do). */
export function defaultSideKey(sides: PitchSide[]): PitchSide['key'] {
  return (sides.find(hasLineup) ?? sides[0])?.key ?? 'home'
}

/** The "הרכב" tab: each club's starting XI on a half-pitch (goalkeeper at the bottom), a club switch, the bench below. */
export function LineupPitch({ sides, events }: { sides: PitchSide[]; events?: FixtureEvent[] }) {
  const t = useTranslations('matches')
  // null until the fan picks: the default follows the data, so a line-up that arrives later is still opened.
  const [picked, setKey] = useState<PitchSide['key'] | null>(null)
  if (sides.every((s) => !s.lu)) return <p className="lc-end">{t('notYet')}</p>
  const key = picked ?? defaultSideKey(sides)
  const side = sides.find((s) => s.key === key) ?? sides[0]!
  return (
    <div className="space-y-3">
      <div className="lc-switch" role="group" aria-label={t('teamSwitch')}>
        {sides.map((s) => (
          <button key={s.key} type="button" aria-pressed={s.key === side.key} onClick={() => setKey(s.key)}>
            <Crest team={s.team} size="sm" />
            <span>{s.team.short}</span>
          </button>
        ))}
      </div>
      <SideLineup side={side} events={events} />
    </div>
  )
}

function SideLineup({ side: { team, lu }, events }: { side: PitchSide; events?: FixtureEvent[] }) {
  const t = useTranslations('matches')
  if (!lu || (lu.xi.length === 0 && lu.sub.length === 0)) return <p className="lc-end">{t('notYet')}</p>
  const spots = pitchSpots(lu.xi)
  const marks = events ? playerMarks(events, lu.team) : null
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
              {t('coach')} <bdi>{lu.coach}</bdi>
            </span>
          )}
        </p>
      )}
      {spots ? (
        <>
          <div className="lc-pitch" style={colours} role="img" aria-label={t('startingXiOf', { team: team.name })}>
            <i className="lc-pitch-arc" />
            <i className="lc-pitch-box" />
            <i className="lc-pitch-six" />
            {spots.map((s, i) => {
              const mk = marks?.get(s.name)
              return (
                <span key={i} className="lc-p" style={{ left: `${s.x}%`, bottom: `${s.y}%` }} title={s.name}>
                  <i>{s.n ?? ''}</i>
                  <small>{pitchName(s.name)}</small>
                  {mk && <Marks mk={mk} />}
                </span>
              )
            })}
          </div>
          {/* The pitch is one picture for screen readers; this list reads the XI out to them. */}
          <ul className="sr-only" aria-label={t('startingXiPlayersOf', { team: team.name })}>
            {lu.xi.map((pl, i) => (
              <li key={i}>{[pl.n, pl.p, pl.pos ? posLabel(t, pl.pos) : null].filter((x) => x !== null && x !== '').join(', ')}</li>
            ))}
          </ul>
        </>
      ) : (
        lu.xi.length > 0 && <PlayerList title={t('startingXi')} players={lu.xi} />
      )}
      {lu.sub.length > 0 && <PlayerList title={t('bench')} players={lu.sub} />}
    </div>
  )
}

/** The little cluster on a player's disc: goals (⚽, with a count past one), a yellow/red card, a "came off" arrow. */
function Marks({ mk }: { mk: PlayerMark }) {
  if (mk.goals === 0 && !mk.yellow && !mk.red && !mk.off) return null
  return (
    <em className="lc-p-marks" aria-hidden="true">
      {mk.goals > 0 && (
        <span className="lc-mk-goal">
          ⚽{mk.goals > 1 ? <b className="t-num">{mk.goals}</b> : ''}
        </span>
      )}
      {mk.red ? <span className="lc-mk-card" data-k="r" /> : mk.yellow ? <span className="lc-mk-card" data-k="y" /> : null}
      {mk.off && <span className="lc-mk-off">↓</span>}
    </em>
  )
}

function PlayerList({ title, players }: { title: string; players: { n: number | null; p: string; pos: string }[] }) {
  const t = useTranslations('matches')
  return (
    <section className="space-y-2">
      <h3 className="lc-list-h">{title}</h3>
      <ul className="lc-list">
        {players.map((pl, i) => (
          <li key={i}>
            <b className="t-num">{pl.n ?? ''}</b>
            <bdi>{pl.p}</bdi>
            {pl.pos && <small>{posLabel(t, pl.pos)}</small>}
          </li>
        ))}
      </ul>
    </section>
  )
}
