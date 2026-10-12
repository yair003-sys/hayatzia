'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { closedFromBroadcast, pollFromRow, talliesFromBroadcast, type Group, type MyVote, type Poll, type Tally } from '../schema'
import type { CrowdState } from '../server/queries'
import { tickAction, voteAction } from '../server/actions'

const KEEP = 20

/** Live crowd-verdict state for one match room: initial server data, then the room's broadcasts. */
export function useCrowd(initial: CrowdState, fixtureId: number, myGroup: Group) {
  const [polls, setPolls] = useState<Poll[]>(initial.polls)
  const [tallies, setTallies] = useState<Record<string, Tally[]>>(initial.tallies)
  const [mine, setMine] = useState<Record<string, MyVote>>(initial.mine)
  const [now, setNow] = useState(() => Date.now())
  const ticked = useRef(new Set<string>())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // When a countdown ends, ask the database to close it (idempotent; every client may ask once).
  useEffect(() => {
    for (const p of polls) {
      if (p.summary === null && Date.parse(p.closesAt) <= now && !ticked.current.has(p.id)) {
        ticked.current.add(p.id)
        void tickAction({ fixtureId })
      }
    }
  }, [now, polls, fixtureId])

  const onChannelEvent = useCallback((event: string, payload: unknown) => {
    if (event === 'poll') {
      const p = pollFromRow(payload)
      if (p) setPolls((cur) => [...cur.filter((x) => x.id !== p.id), p].sort((a, b) => a.opensAt.localeCompare(b.opensAt)).slice(-KEEP))
    } else if (event === 'tally') {
      const t = talliesFromBroadcast(payload)
      if (t) setTallies((cur) => ({ ...cur, [t.pollId]: t.tallies }))
    } else if (event === 'poll_closed') {
      const c = closedFromBroadcast(payload)
      if (!c) return
      setPolls((cur) => cur.map((p) => (p.id === c.pollId ? { ...p, summary: c.summary } : p)))
      setTallies((cur) => ({ ...cur, [c.pollId]: c.tallies }))
    }
  }, [])

  /** Optimistic: my choice and my count show at once; the next broadcast reconciles. */
  const vote = useCallback(
    async (pollId: string, option: string, optionIn?: string): Promise<string | null> => {
      const before = mine[pollId] ?? null
      const next: MyVote = { option, optionIn: optionIn ?? null }
      setMine((cur) => ({ ...cur, [pollId]: next }))
      setTallies((cur) => ({ ...cur, [pollId]: shift(cur[pollId] ?? [], before, next, myGroup) }))
      const r = await voteAction({ pollId, option, optionIn })
      const error = r.data && 'error' in r.data ? r.data.error : r.serverError ?? (r.validationErrors ? 'בחירה לא תקינה' : null)
      if (error) {
        setMine((cur) => {
          const rest = { ...cur }
          if (before) rest[pollId] = before
          else delete rest[pollId]
          return rest
        })
        setTallies((cur) => ({ ...cur, [pollId]: shift(cur[pollId] ?? [], next, before, myGroup) }))
      }
      return error
    },
    [mine, myGroup],
  )

  return { polls, tallies, mine, now, vote, onChannelEvent }
}

function bump(list: Tally[], row: 'o' | 'i', option: string, group: Group, d: number): Tally[] {
  const i = list.findIndex((t) => t.row === row && t.option === option && t.group === group)
  if (i < 0) return d > 0 ? [...list, { row, option, group, n: d }] : list
  return list.map((t, j) => (j === i ? { ...t, n: Math.max(0, t.n + d) } : t))
}

function shift(list: Tally[], from: MyVote | null, to: MyVote | null, g: Group): Tally[] {
  let out = list
  if (from) {
    out = bump(out, 'o', from.option, g, -1)
    if (from.optionIn) out = bump(out, 'i', from.optionIn, g, -1)
  }
  if (to) {
    out = bump(out, 'o', to.option, g, 1)
    if (to.optionIn) out = bump(out, 'i', to.optionIn, g, 1)
  }
  return out
}
