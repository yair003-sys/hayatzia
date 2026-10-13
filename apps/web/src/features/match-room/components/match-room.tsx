'use client'

import { useEffect, useState } from 'react'
import { ChatRoom } from '@/features/chat/components/chat-room'
import type { ChatMessage } from '@/features/chat/schema'
import { roomState, type RoomState } from '../schema'
import { loadOlderMatchMessagesAction, sendMatchMessageAction } from '../server/actions'
import { PinnedStrip } from '@/features/crowd-verdict/components/pinned-strip'
import { PollCard } from '@/features/crowd-verdict/components/poll-card'
import { useCrowd } from '@/features/crowd-verdict/components/use-crowd'
import { canVote, pollState } from '@/features/crowd-verdict/schema'
import type { CrowdState } from '@/features/crowd-verdict/server/queries'
import { usePresence } from '@/features/stand-home/components/presence'

type Side = { id: string; short: string; bar: string }

type Props = {
  fixtureId: number
  kickoff: number // unix seconds
  meId: string
  myTeamId: string
  home: Side
  away: Side
  initial: ChatMessage[]
  hidden: string[]
  crowd: CrowdState
}

const STATE_LABEL: Record<RoomState, string> = {
  soon: 'החדר נפתח 30 דקות לפני שריקת הפתיחה',
  open: 'החדר פתוח',
  closing: 'החדר נסגר בקרוב',
  closed: 'החדר נסגר',
}

export function MatchRoom({ fixtureId, kickoff, meId, myTeamId, home, away, initial, hidden, crowd }: Props) {
  const myGroup = myTeamId === home.id ? 'h' : myTeamId === away.id ? 'a' : 'n'
  const c = useCrowd(crowd, fixtureId, myGroup)
  const inRoom = usePresence(`room:${fixtureId}`, meId)
  const openPolls = [...c.polls].reverse().filter((p) => pollState(p, c.now) === 'open')
  // With two club cards open at minute 60, jump to the one this fan can vote in.
  const openPoll = openPolls.find((p) => canVote(p, myTeamId, c.now)) ?? openPolls[0] ?? null
  const inserts = c.polls.flatMap((p) => [
    {
      key: `poll-${p.id}`,
      at: p.opensAt,
      node: (
        <PollCard
          poll={p}
          tallies={c.tallies[p.id] ?? []}
          mine={c.mine[p.id] ?? null}
          now={c.now}
          myTeamId={myTeamId}
          home={home}
          away={away}
          onVote={c.vote}
        />
      ),
    },
    ...(p.summary
      ? [{ key: `sum-${p.id}`, at: p.closesAt, node: <p className="self-center py-0.5 text-xs text-dim">{p.summary}</p> }]
      : []),
  ])

  const [state, setState] = useState<RoomState>(() => roomState(kickoff, Date.now()))
  useEffect(() => {
    const t = setInterval(() => setState(roomState(kickoff, Date.now())), 30_000)
    return () => clearInterval(t)
  }, [kickoff])

  const playing = myTeamId === home.id || myTeamId === away.id
  const writable = state === 'open' || state === 'closing'
  const readOnly = !writable
    ? STATE_LABEL[state]
    : !playing
      ? `רק אוהדי ${home.short} ו${away.short} כותבים כאן. אתה מוזמן לקרוא.`
      : undefined

  return (
    <section aria-labelledby="room-title" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id="room-title" className="font-bold">
          חדר המשחק
        </h3>
        <span
          className={
            writable
              ? 'rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok'
              : 'rounded-full border border-line px-2 py-0.5 text-xs text-muted'
          }
        >
          {STATE_LABEL[state]}
          {inRoom !== null && inRoom > 0 && ` · ${inRoom.toLocaleString('he-IL')} בחדר`}
        </span>
      </div>
      <ChatRoom
        topic={`match:${fixtureId}`}
        inserts={inserts}
        onChannelEvent={c.onChannelEvent}
        pinned={
          <PinnedStrip
            poll={openPoll}
            tallies={openPoll ? (c.tallies[openPoll.id] ?? []) : []}
            mine={openPoll ? (c.mine[openPoll.id] ?? null) : null}
            myTeamId={myTeamId}
            now={c.now}
          />
        }
        meId={meId}
        initial={initial}
        hiddenUsers={hidden}
        readOnly={readOnly}
        placeholder="מה קורה במגרש?"
        emptyText={state === 'soon' ? 'עוד מוקדם. נתראה לפני שריקת הפתיחה.' : 'עוד אין הודעות בחדר.'}
        tint={(m) => (m.side === 'a' ? away.bar : home.bar)}
        send={async (body) => {
          const r = await sendMatchMessageAction({ fixtureId, body })
          return r.data ?? { error: r.serverError ?? r.validationErrors?.body?._errors?.[0] ?? 'ההודעה לא נשלחה' }
        }}
        loadOlder={async (cursor) =>
          (await loadOlderMatchMessagesAction({ fixtureId, ...cursor })).data?.messages ?? []
        }
      />
    </section>
  )
}
