'use server'

import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { chatErrorHe, chatErrorKind, cursorSchema, MESSAGE_COLUMNS, sendMessageSchema, type SendResult } from '@/features/chat/schema'
import { getTeamMessages } from './queries'

const reactSchema = z.object({ messageId: z.uuid(), kind: z.union([z.literal(1), z.literal(-1), z.literal(0)]) })

/**
 * Only the text (and the answered message, for a reply) is sent. The database stamps club, nickname, time and the
 * reply's snapshot, and rate-limits (5 per 10 s).
 */
export const sendTeamMessageAction = actionClient
  .inputSchema(sendMessageSchema)
  .action(async ({ parsedInput }): Promise<SendResult> => {
    const supabase = await createClient()
    if (!supabase) return { error: 'הצ׳אט לא זמין בסביבה הזאת' }
    const { data, error } = await supabase
      .from('team_messages')
      .insert({ body: parsedInput.body, reply_to: parsedInput.replyTo ?? null })
      .select(MESSAGE_COLUMNS)
      .single()
    if (error) return { error: chatErrorHe(error.message), kind: chatErrorKind(error.message) }
    return { message: data }
  })

export const loadOlderTeamMessagesAction = actionClient
  .inputSchema(cursorSchema)
  .action(async ({ parsedInput }) => ({ messages: await getTeamMessages(parsedInput) }))

/**
 * אהבתי / לא אהבתי on a club-chat message. kind 1 = like, -1 = dislike, 0 = remove mine. The database keeps the counts
 * on the message and broadcasts the new totals to the club (team:<club>). RLS limits the write to my own reaction and
 * my club; one reaction per fan per message (so a like replaces a dislike). Not upsert — the column grants let me set
 * only `kind` on update and only `message_id`+`kind` on insert, so we update my row and insert it when there is none.
 */
export const reactTeamMessageAction = actionClient.inputSchema(reactSchema).action(async ({ parsedInput: { messageId, kind } }) => {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'התגובות לא זמינות בסביבה הזאת' }
  if (kind === 0) {
    const { error } = await supabase.from('message_reactions').delete().eq('message_id', messageId)
    return error ? { ok: false as const, error: 'לא נשמר' } : { ok: true as const }
  }
  const upd = await supabase.from('message_reactions').update({ kind }).eq('message_id', messageId).select('message_id')
  if (upd.error) return { ok: false as const, error: 'לא נשמר' }
  if ((upd.data?.length ?? 0) === 0) {
    const ins = await supabase.from('message_reactions').insert({ message_id: messageId, kind })
    if (ins.error) return { ok: false as const, error: 'לא נשמר' }
  }
  return { ok: true as const }
})
