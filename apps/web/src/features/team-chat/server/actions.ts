'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { cursorSchema, sendMessageSchema, type ChatMessage } from '../schema'
import { getTeamMessages } from './queries'

type SendResult = { message: ChatMessage } | { error: string }

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
    if (error) {
      if (error.message.includes('rate_limit')) return { error: 'לאט לאט 🙂 נסה שוב בעוד כמה שניות' }
      return { error: 'ההודעה לא נשלחה. נסה שוב' }
    }
    return { message: data }
  })

export const loadOlderTeamMessagesAction = actionClient
  .inputSchema(cursorSchema)
  .action(async ({ parsedInput }) => ({ messages: await getTeamMessages(parsedInput) }))
