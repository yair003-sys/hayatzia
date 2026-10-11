'use client'

import { ChatRoom } from '@/features/chat/components/chat-room'
import type { ChatMessage } from '@/features/chat/schema'
import { loadOlderTeamMessagesAction, sendTeamMessageAction } from '../server/actions'

export function TeamChat({ teamId, meId, initial }: { teamId: string; meId: string; initial: ChatMessage[] }) {
  return (
    <ChatRoom
      topic={`team:${teamId}`}
      meId={meId}
      initial={initial}
      placeholder="כתוב ליציע…"
      emptyText="עוד אין הודעות. תפתח את היציע 👋"
      send={async (body) => {
        const r = await sendTeamMessageAction({ body })
        return r.data ?? { error: r.serverError ?? r.validationErrors?.body?._errors?.[0] ?? 'ההודעה לא נשלחה' }
      }}
      loadOlder={async (cursor) => (await loadOlderTeamMessagesAction(cursor)).data?.messages ?? []}
    />
  )
}
