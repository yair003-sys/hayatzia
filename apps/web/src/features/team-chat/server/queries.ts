import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { MESSAGE_COLUMNS, PAGE_SIZE, type ChatMessage } from '@/features/chat/schema'

/**
 * Newest page of the fan's team chat (oldest first), or older than `before` (keyset, never OFFSET).
 * Private data: reads the session cookie, never cached. RLS limits rows to the fan's club.
 * null when the read failed: the chat says "could not load" instead of opening empty (load test 2026-10-17, finding 6).
 */
export async function getTeamMessages(before?: { createdAt: string; id: string }): Promise<ChatMessage[] | null> {
  const supabase = await createClient()
  if (!supabase) return []
  let q = supabase
    .from('team_messages')
    .select(`${MESSAGE_COLUMNS},likes,dislikes`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) {
    q = q.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`)
  }
  const { data, error } = await q
  if (error || !data) return null
  const rows = data.reverse()
  // My own like / dislike for the messages on this page (one small keyed read; RLS already limits to my club).
  const ids = rows.map((r) => r.id)
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  const mine =
    ids.length > 0 && me
      ? (await supabase.from('message_reactions').select('message_id,kind').eq('user_id', me).in('message_id', ids)).data
      : []
  const myKind = new Map((mine ?? []).map((r) => [r.message_id, r.kind]))
  return rows.map((r) => ({ ...r, myReaction: (myKind.get(r.id) ?? 0) as 1 | -1 | 0 }))
}
