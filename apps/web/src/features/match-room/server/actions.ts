'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { chatErrorHe, MESSAGE_COLUMNS, type SendResult } from '@/features/chat/schema'
import { olderMatchMessagesSchema, sendMatchMessageSchema } from '../schema'
import { getMatchMessages } from './queries'

/** The database checks the window, the fan's club and the rate limit, and stamps side, nickname, time and reply. */
export const sendMatchMessageAction = actionClient
  .inputSchema(sendMatchMessageSchema)
  .action(async ({ parsedInput }): Promise<SendResult> => {
    const supabase = await createClient()
    if (!supabase) return { error: 'החדר לא זמין בסביבה הזאת' }
    const { data, error } = await supabase
      .from('match_messages')
      .insert({ fixture_id: parsedInput.fixtureId, body: parsedInput.body, reply_to: parsedInput.replyTo ?? null })
      .select(`${MESSAGE_COLUMNS},side` as const)
      .single()
    if (error) return { error: chatErrorHe(error.message) }
    return { message: { ...data, side: data.side === 'a' ? 'a' : 'h' } }
  })

export const loadOlderMatchMessagesAction = actionClient
  .inputSchema(olderMatchMessagesSchema)
  .action(async ({ parsedInput: { fixtureId, ...cursor } }) => ({
    messages: await getMatchMessages(fixtureId, cursor),
  }))
