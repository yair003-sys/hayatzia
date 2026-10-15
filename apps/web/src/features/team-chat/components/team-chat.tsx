'use client'

import { ChatRoom } from '@/features/chat/components/chat-room'
import type { ChatMessage } from '@/features/chat/schema'
import { loadOlderTeamMessagesAction, sendTeamMessageAction } from '../server/actions'

export function TeamChat({ teamId, meId, initial, hidden, color }: { teamId: string; meId: string; initial: ChatMessage[]; hidden: string[]; color?: string }) {
  return (
    <ChatRoom
      topic={`team:${teamId}`}
      // "N כותבים…" rides on the club's "online now" presence, which the app layout already tracks (OnlineTracker).
      presenceTopic={`online:${teamId}`}
      meId={meId}
      initial={initial}
      hiddenUsers={hidden}
      reportKind="team_message"
      doodle={color}
      placeholder="כתוב לקבוצה…"
      emptyText="עוד אין הודעות. כתוב את הראשונה."
      send={async (body, replyTo) => {
        const r = await sendTeamMessageAction({ body, replyTo })
        // A text the schema refuses (too long…) goes back to the box; a server failure can be retried.
        return r.data ?? { error: r.serverError ?? r.validationErrors?.body?._errors?.[0] ?? 'ההודעה לא נשלחה', kind: r.validationErrors ? 'permanent' : 'retry' }
      }}
      loadOlder={async (cursor) => (await loadOlderTeamMessagesAction(cursor)).data?.messages ?? []}
    />
  )
}
