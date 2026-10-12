'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { closedFromBroadcast, mergePolls, pollFromRow, talliesFromBroadcast, type Group, type MyVote, type Poll, type Tally } from '../schema'
import type { CrowdState } from '../server/queries'
import { refreshCrowdAction, tickAction, voteAction } from '../server/actions'

/** Live crowd-verdict state for one match room: initial server data, then the room's broadcasts. */
export function useCrowd(initial: CrowdState, fixtureId: number, myGroup: Group) {
  const [polls, setPolls] = useState<Poll[]>(initial.polls)
  const [tallies, setTallies] = useState<Record<string, Tally[]>>(initial.tallies)
  const [mine, setMine] = useState<Record<string, MyVote>>(initial.mine)
  const [now, setNow] = useState(() => Date.now())
  const ticked = useRef(new Set<string>())
  const known = useRef(new Set(initial.polls.map((p) => p.id)))
  const refreshing = useRef(false)

  useEffect(() => {
    known.current = new Set(polls.map((p) => p.id))
  }, [polls])

  // A tally or closing for a poll we never saw means we missed its opening broadcast: re-read once.
  const refresh = useCallback(() => {
    if (refreshing.current) return
    refreshing.current = true
    void refreshCrowdAction({ fixtureId }).then((r) => {
      refreshing.current = false
      const s = r.data
      if (!s) return
      setPolls((cur) => mergePolls(cur, s.polls))
      setTallies((cur) => ({ ...cur, ...s.tallies }))
      setMine((cur) => ({ ...s.mine, ...cur }))
    })
  }, [fixtureId])

  // The clock runs only while some poll is still waiting for its summary.
  const live = polls.some((p) => p.summary === null)
  useEffect(() => {
    if (!live) return
    const first = setTimeout(() => setNow(Date.now()), 0)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [live])

  // When a countdown ends, ask the database to close it. Every client may ask, so each waits a random
  // 0–3 s and skips if the closing broadcast already arrived (spreads the load in a full stadium).
  const latest = useRef(polls)
  useEffect(() => {
    latest.current = polls
  }, [polls])
  useEffect(() => {
    for (const p of polls) {
      if (p.summary === null && Date.parse(p.closesAt) <= now && !ticked.current.has(p.id)) {
        ticked.current.add(p.id)
        setTimeout(() => {
          if (latest.current.find((x) => x.id === p.id)?.summary === null) void tickAction({ fixtureId })
        }, Math.random() * 3000)
      }
    }
  }, [now, polls, fixtureId])

  const onChannelEvent = useCallback((event: string, payload: unknown) => {
    if (event === 'poll') {
      const p = pollFromRow(payload)
      if (p) setPolls((cur) => mergePolls(cur, [p]))
    } else if (event === 'tally') {
      const t = talliesFromBroadcast(payload)
      if (!t) return
      if (!known.current.has(t.pollId)) refresh()
      setTallies((cur) => ({ ...cur, [t.pollId]: t.tallies }))
    } else if (event === 'poll_closed') {
      const c = closedFromBroadcast(payload)
      if (!c) return
      if (!known.current.has(c.pollId)) refresh()
      setPolls((cur) => cur.map((p) => (p.id === c.pollId ? { ...p, summary: c.summary } : p)))
      setTallies((cur) => ({ ...cur, [c.pollId]: c.tallies }))
    }
  }, [refresh])

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
