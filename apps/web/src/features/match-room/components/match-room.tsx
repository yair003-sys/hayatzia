'use client'

import { useEffect, useState } from 'react'
import { ChatRoom } from '@/features/chat/components/chat-room'
import type { ChatMessage } from '@/features/chat/schema'
import { roomState, type RoomState } from '../schema'
import { loadOlderMatchMessagesAction, sendMatchMessageAction } from '../server/actions'

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
}

const STATE_LABEL: Record<RoomState, string> = {
  soon: 'החדר נפתח 30 דקות לפני שריקת הפתיחה',
  open: 'החדר פתוח',
  closing: 'החדר נסגר בקרוב',
  closed: 'החדר נסגר',
}

export function MatchRoom({ fixtureId, kickoff, meId, myTeamId, home, away, initial, hidden }: Props) {
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
        </span>
      </div>
      <ChatRoom
        topic={`match:${fixtureId}`}
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
