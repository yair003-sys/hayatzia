'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { chatErrorHe, type SendResult } from '@/features/chat/schema'
import { olderMatchMessagesSchema, sendMatchMessageSchema } from '../schema'
import { getMatchMessages } from './queries'

/** The database checks the window, the fan's club and the rate limit, and stamps side, nickname and time. */
export const sendMatchMessageAction = actionClient
  .inputSchema(sendMatchMessageSchema)
  .action(async ({ parsedInput }): Promise<SendResult> => {
    const supabase = await createClient()
    if (!supabase) return { error: 'החדר לא זמין בסביבה הזאת' }
    const { data, error } = await supabase
      .from('match_messages')
      .insert({ fixture_id: parsedInput.fixtureId, body: parsedInput.body })
      .select('id,user_id,nick,body,created_at,side')
      .single()
    if (error) return { error: chatErrorHe(error.message) }
    return { message: { ...data, side: data.side === 'a' ? 'a' : 'h' } }
  })

export const loadOlderMatchMessagesAction = actionClient
  .inputSchema(olderMatchMessagesSchema)
  .action(async ({ parsedInput: { fixtureId, ...cursor } }) => ({
    messages: await getMatchMessages(fixtureId, cursor),
  }))
