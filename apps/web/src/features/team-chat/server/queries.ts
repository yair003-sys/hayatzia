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
    .select(MESSAGE_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) {
    q = q.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`)
  }
  const { data, error } = await q
  if (error || !data) return null
  return data.reverse()
}
