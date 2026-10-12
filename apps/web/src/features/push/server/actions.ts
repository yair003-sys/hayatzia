'use server'

import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { endpointSchema, subscriptionSchema } from '../schema'
import { sendPush } from './send'

export const saveSubscriptionAction = actionClient.inputSchema(subscriptionSchema).action(async ({ parsedInput: s }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase
    .from('push_subscriptions')
    .insert({ endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth })
  if (error && error.code !== '23505') return { error: 'לא הצלחנו להפעיל התראות' }
  return { ok: true as const }
})

export const removeSubscriptionAction = actionClient.inputSchema(endpointSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  await supabase?.from('push_subscriptions').delete().eq('endpoint', parsedInput.endpoint)
  return { ok: true as const }
})

/**
 * After a private message is written (by the browser, encrypted), tell the other member. The notification carries
 * no message content: only the sender's nickname. Membership is checked with the sender's own session (RLS).
 */
export const notifyDmAction = actionClient.inputSchema(z.object({ threadId: z.uuid() })).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { ok: true as const }
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  const { data: t } = await supabase
    .from('dm_threads')
    .select('id,user_a,user_b,nick_a,nick_b')
    .eq('id', parsedInput.threadId)
    .maybeSingle()
  if (!me || !t) return { ok: true as const }
  const meIsA = t.user_a === me
  await sendPush([meIsA ? t.user_b : t.user_a], {
    title: 'הודעה פרטית חדשה',
    body: `מ־${meIsA ? t.nick_a : t.nick_b}`,
    url: `/inbox/${t.id}`,
    tag: `dm:${t.id}`,
  })
  return { ok: true as const }
})
