import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { PAGE_SIZE, type ChatMessage } from '@/features/chat/schema'

const COLUMNS = 'id,user_id,nick,body,created_at'

/**
 * Newest page of the fan's team chat (oldest first), or older than `before` (keyset, never OFFSET).
 * Private data: reads the session cookie, never cached. RLS limits rows to the fan's club.
 */
export async function getTeamMessages(before?: { createdAt: string; id: string }): Promise<ChatMessage[]> {
  const supabase = await createClient()
  if (!supabase) return []
  let q = supabase
    .from('team_messages')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) {
    q = q.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`)
  }
  const { data, error } = await q
  if (error || !data) return []
  return data.reverse()
}
