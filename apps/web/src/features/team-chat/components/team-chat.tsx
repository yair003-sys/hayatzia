'use client'

import { useTranslations } from 'next-intl'
import { ChatRoom } from '@/features/chat/components/chat-room'
import type { ChatMessage } from '@/features/chat/schema'
import { loadOlderTeamMessagesAction, reactTeamMessageAction, sendTeamMessageAction } from '../server/actions'

export function TeamChat({
  teamId,
  meId,
  initial,
  hidden,
  color,
  clubName,
}: {
  teamId: string
  meId: string
  initial: ChatMessage[]
  hidden: string[]
  color?: string
  clubName?: string
}) {
  const t = useTranslations('teamChat')
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
      // Every writer here is of my club: the avatar opens a private message (2026-10-16).
      clubOf={() => (clubName ? { name: clubName, color: color ?? 'var(--accent)' } : null)}
      placeholder={t('placeholder')}
      emptyText={t('emptyText')}
      send={async (body, replyTo) => {
        const r = await sendTeamMessageAction({ body, replyTo })
        // A text the schema refuses (too long…) goes back to the box; a server failure can be retried.
        return r.data ?? { error: r.serverError ?? r.validationErrors?.body?._errors?.[0] ?? t('sendFailed'), kind: r.validationErrors ? 'permanent' : 'retry' }
      }}
      loadOlder={async (cursor) => (await loadOlderTeamMessagesAction(cursor)).data?.messages ?? null}
      onReact={(messageId, kind) => void reactTeamMessageAction({ messageId, kind })}
    />
  )
}
