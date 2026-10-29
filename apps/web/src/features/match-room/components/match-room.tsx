'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
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
import { BattleBar } from './battle-bar'
import { useBattle } from './use-battle'

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
  /** Match centre only: show the live battle bar over the chat (opens its own realtime channel). */
  battle?: boolean
}

export function MatchRoom({ fixtureId, kickoff, meId, myTeamId, home, away, initial, hidden, crowd, battle = false }: Props) {
  const t = useTranslations('room')
  const stateLabel: Record<RoomState, string> = { soon: t('roomSoon'), open: t('roomOpen'), closing: t('roomClosing'), closed: t('roomClosed') }
  const myGroup = myTeamId === home.id ? 'h' : myTeamId === away.id ? 'a' : 'n'
  const mySide = myGroup === 'h' ? 'h' : myGroup === 'a' ? 'a' : null
  const battleStore = useBattle(fixtureId, mySide, battle)
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
    ? stateLabel[state]
    : !playing
      ? t('readOnlyNote', { home: home.short, away: away.short })
      : undefined

  return (
    <section aria-labelledby="room-title" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id="room-title" className="font-bold">
          {t('roomTitle')}
        </h3>
        <span
          className={
            writable
              ? 'rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok'
              : 'rounded-full border border-line px-2 py-0.5 text-xs text-muted'
          }
        >
          {stateLabel[state]}
          {inRoom !== null && inRoom > 0 && ` · ${t('inRoom', { count: inRoom.toLocaleString('he-IL') })}`}
        </span>
      </div>
      {battle && <BattleBar home={home} away={away} mySide={mySide} store={battleStore} />}
      <ChatRoom
        topic={`match:${fixtureId}`}
        onLiveMessage={
          battle
            ? (side) => {
                if (side) battleStore.add(side)
              }
            : undefined
        }
        // "N כותבים…" rides on the room's presence, tracked just above for the "N בחדר" count.
        presenceTopic={`room:${fixtureId}`}
        openAtEnd={false}
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
        reportKind="match_message"
        readOnly={readOnly}
        placeholder={t('placeholder')}
        emptyText={state === 'soon' ? t('emptyEarly') : t('emptyNone')}
        tint={(m) => (m.side === 'a' ? away.bar : home.bar)}
        // The writer's avatar opens a private message, also to fans of the other club (2026-10-16).
        clubOf={(m) => (m.side === 'a' ? { name: away.short, color: away.bar } : m.side === 'h' ? { name: home.short, color: home.bar } : null)}
        send={async (body, replyTo) => {
          const r = await sendMatchMessageAction({ fixtureId, body, replyTo })
          // A text the schema refuses (too long…) goes back to the box; a server failure can be retried.
          return r.data ?? { error: r.serverError ?? r.validationErrors?.body?._errors?.[0] ?? t('sendFailed'), kind: r.validationErrors ? 'permanent' : 'retry' }
        }}
        loadOlder={async (cursor) =>
          (await loadOlderMatchMessagesAction({ fixtureId, ...cursor })).data?.messages ?? null
        }
      />
    </section>
  )
}
