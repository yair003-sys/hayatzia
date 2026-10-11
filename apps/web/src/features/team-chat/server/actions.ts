'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { chatErrorHe, cursorSchema, sendMessageSchema, type SendResult } from '@/features/chat/schema'
import { getTeamMessages } from './queries'

/** Only the text is sent. The database stamps club, nickname and time, and rate-limits (5 per 10 s). */
export const sendTeamMessageAction = actionClient
  .inputSchema(sendMessageSchema)
  .action(async ({ parsedInput }): Promise<SendResult> => {
    const supabase = await createClient()
    if (!supabase) return { error: 'הצ׳אט לא זמין בסביבה הזאת' }
    const { data, error } = await supabase
      .from('team_messages')
      .insert({ body: parsedInput.body })
      .select('id,user_id,nick,body,created_at')
      .single()
    if (error) return { error: chatErrorHe(error.message) }
    return { message: data }
  })

export const loadOlderTeamMessagesAction = actionClient
  .inputSchema(cursorSchema)
  .action(async ({ parsedInput }) => ({ messages: await getTeamMessages(parsedInput) }))
