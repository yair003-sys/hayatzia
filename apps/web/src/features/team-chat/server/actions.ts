'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { chatErrorHe, chatErrorKind, cursorSchema, MESSAGE_COLUMNS, sendMessageSchema, type SendResult } from '@/features/chat/schema'
import { getTeamMessages } from './queries'

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
