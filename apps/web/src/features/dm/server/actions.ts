'use server'

import { redirect } from 'next/navigation'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { sendMessagePush } from '@/features/push/server/send'
import {
  createGroupSchema,
  groupErrorHe,
  groupIdSchema,
  groupMemberSchema,
  inviteSchema,
  markReadSchema,
  muteSchema,
  orderedPair,
  otherUserSchema,
  renameSchema,
  teammateSearchSchema,
} from '../schema'
import { z } from 'zod'
import { searchTeammates } from './queries'

/** Opens (or reuses) the conversation with a teammate. Carries no message content. */
export const openThreadAction = actionClient.inputSchema(otherUserSchema).action(async ({ parsedInput: { otherId } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  if (!me) redirect('/login')
  const pair = orderedPair(me, otherId)
  const existing = await supabase.from('dm_threads').select('id').eq('user_a', pair.user_a).eq('user_b', pair.user_b).maybeSingle()
  let id = existing.data?.id
  if (!id) {
    const { data, error } = await supabase.from('dm_threads').insert(pair).select('id').single()
    if (error) {
      if (error.message.includes('blocked')) return { error: 'אי אפשר לפתוח שיחה עם האוהד הזה' }
      return { error: 'פתיחת השיחה נכשלה' }
    }
    id = data.id
  }
  redirect(`/inbox/${id}`)
})

export const searchTeammatesAction = actionClient.inputSchema(teammateSearchSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  const { data: claims } = (await supabase?.auth.getClaims()) ?? { data: null }
  const me = claims?.claims.sub
  if (!me) return { fans: [] }
  return { fans: await searchTeammates(me, parsedInput.q) }
})

const RPC_CODES = ['not_admin', 'not_member', 'group_full', 'not_same_team', 'blocked', 'invite_expired', 'bad_name', 'no_members', 'bad_kind']

function errorCode(message: string): string {
  return RPC_CODES.find((c) => message.includes(c)) ?? ''
}

async function myId(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>): Promise<string | undefined> {
  const { data: claims } = await supabase.auth.getClaims()
  return claims?.claims.sub
}

async function signedIn() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) redirect('/login')
  return supabase
}

/**
 * Tells the fans just invited to a group. Carries no message content: the inviter's nickname and the group name.
 * sendMessagePush never throws, so a failed notification never fails the invite; fans with messages off are skipped.
 */
async function pushInvites(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, groupId: string, invited: string[]) {
  const me = await myId(supabase)
  if (!me || invited.length === 0) return
  const [{ data: group }, { data: profile }] = await Promise.all([
    supabase.from('dm_groups').select('name').eq('id', groupId).maybeSingle(),
    supabase.from('profiles').select('nick').eq('user_id', me).maybeSingle(),
  ])
  if (!group) return
  await sendMessagePush(invited, {
    title: 'הזמנה לקבוצה',
    body: `${profile?.nick ?? 'אוהד'} · ${group.name}`,
    url: '/inbox',
    tag: `invite:${groupId}`,
  })
}

export const createGroupAction = actionClient.inputSchema(createGroupSchema).action(async ({ parsedInput }) => {
  const supabase = await signedIn()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data, error } = await supabase.rpc('create_group', { p_name: parsedInput.name, p_members: parsedInput.memberIds })
  if (error || !data) return { error: groupErrorHe(errorCode(error?.message ?? '')) }
  // A new group has nobody yet: every picked fan (other than me) was invited.
  const me = await myId(supabase)
  await pushInvites(supabase, data, parsedInput.memberIds.filter((id) => id !== me))
  redirect(`/inbox/g/${data}`)
})

export const inviteAction = actionClient.inputSchema(inviteSchema).action(async ({ parsedInput }) => {
  const supabase = await signedIn()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data, error } = await supabase.rpc('invite_to_group', { p_group: parsedInput.groupId, p_members: parsedInput.memberIds })
  if (error) return { error: groupErrorHe(errorCode(error.message)) }
  const invited = data ?? [] // fans already in the group or already invited are skipped by the database
  await pushInvites(supabase, parsedInput.groupId, invited)
  return { ok: true as const, invited: invited.length }
})

export const answerInviteAction = actionClient
  .inputSchema(z.object({ groupId: z.uuid(), yes: z.boolean() }))
  .action(async ({ parsedInput }) => {
    const supabase = await signedIn()
    if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
    const { error } = await supabase.rpc('answer_invite', { p_group: parsedInput.groupId, p_yes: parsedInput.yes })
    if (error) return { error: groupErrorHe(errorCode(error.message)) }
    if (parsedInput.yes) redirect(`/inbox/g/${parsedInput.groupId}`)
    return { ok: true as const }
  })

export const removeMemberAction = actionClient.inputSchema(groupMemberSchema).action(async ({ parsedInput }) => {
  const supabase = await signedIn()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.rpc('remove_from_group', { p_group: parsedInput.groupId, p_user: parsedInput.userId })
  if (error) return { error: groupErrorHe(errorCode(error.message)) }
  return { ok: true as const }
})

export const leaveGroupAction = actionClient.inputSchema(groupIdSchema).action(async ({ parsedInput }) => {
  const supabase = await signedIn()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.rpc('leave_group', { p_group: parsedInput.groupId })
  if (error) return { error: groupErrorHe(errorCode(error.message)) }
  redirect('/inbox')
})

export const renameGroupAction = actionClient.inputSchema(renameSchema).action(async ({ parsedInput }) => {
  const supabase = await signedIn()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.rpc('rename_group', { p_group: parsedInput.groupId, p_name: parsedInput.name })
  if (error) return { error: groupErrorHe(errorCode(error.message)) }
  return { ok: true as const }
})

export const muteGroupAction = actionClient.inputSchema(muteSchema).action(async ({ parsedInput }) => {
  const supabase = await signedIn()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.rpc('mute_group', { p_group: parsedInput.groupId, p_muted: parsedInput.muted })
  if (error) return { error: groupErrorHe(errorCode(error.message)) }
  return { ok: true as const }
})

export const markReadAction = actionClient.inputSchema(markReadSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { ok: true as const }
  await supabase.rpc('mark_read', { p_kind: parsedInput.kind, p_id: parsedInput.id })
  return { ok: true as const }
})
