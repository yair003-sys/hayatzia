'use server'

import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { endpointSchema, prefsSchema, subscriptionSchema } from '../schema'
import { sendMessagePush } from './send'

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
  // Security (2026-10-15): only right after a real message by me, never across a block, at most once per 10 seconds.
  const { data: allowed } = await supabase.rpc('claim_message_push', { p_kind: 'dm', p_id: t.id })
  if (!allowed) return { ok: true as const }
  const meIsA = t.user_a === me
  await sendMessagePush([meIsA ? t.user_b : t.user_a], {
    title: 'הודעה פרטית חדשה',
    body: `מ־${meIsA ? t.nick_a : t.nick_b}`,
    url: `/inbox/${t.id}`,
    tag: `dm:${t.id}`,
  })
  return { ok: true as const }
})

/**
 * After a group message is written (by the browser, encrypted), tell the other non-muted members. The notification
 * carries no message content: only the group name and the sender's nickname. Who to notify comes from the database
 * (group_push_targets): fellow members of the sender only, never one with a block either way with the sender.
 */
export const notifyGroupAction = actionClient.inputSchema(z.object({ groupId: z.uuid() })).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { ok: true as const }
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  if (!me) return { ok: true as const }
  // Security (2026-10-15): only right after a real message by me, at most once per 10 seconds per group.
  const { data: allowed } = await supabase.rpc('claim_message_push', { p_kind: 'grp', p_id: parsedInput.groupId })
  if (!allowed) return { ok: true as const }
  const [{ data: group }, { data: targets }] = await Promise.all([
    supabase.from('dm_groups').select('id,name').eq('id', parsedInput.groupId).maybeSingle(),
    supabase.rpc('group_push_targets', { p_group: parsedInput.groupId }),
  ])
  if (!group || !targets?.length) return { ok: true as const }
  const { data: profile } = await supabase.from('profiles').select('nick').eq('user_id', me).maybeSingle()
  await sendMessagePush(targets, {
    title: 'הודעה חדשה בקבוצה',
    body: `${group.name} · מ־${profile?.nick ?? 'אוהד'}`,
    url: `/inbox/g/${group.id}`,
    tag: `grp:${group.id}`,
  })
  return { ok: true as const }
})

/** Saves the signed-in fan's notification settings (own row only, by RLS; user_id defaults to the session). */
export const savePrefsAction = actionClient.inputSchema(prefsSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'צריך להתחבר' }
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ matches: parsedInput.matches, messages: parsedInput.messages }, { onConflict: 'user_id' })
  if (error) return { error: 'השמירה נכשלה. נסה שוב' }
  return { ok: true as const }
})
