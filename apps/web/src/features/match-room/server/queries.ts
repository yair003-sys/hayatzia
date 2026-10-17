import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { MESSAGE_COLUMNS, PAGE_SIZE, type ChatMessage, type Cursor } from '@/features/chat/schema'

/**
 * Newest page of a match room (oldest first), or older than `before`. Reads the session: never cached.
 * null when the read failed: the room says "could not load" instead of opening empty (load test 2026-10-17, finding 6).
 */
export async function getMatchMessages(fixtureId: number, before?: Cursor): Promise<ChatMessage[] | null> {
  const supabase = await createClient()
  if (!supabase) return []
  let q = supabase
    .from('match_messages')
    .select(`${MESSAGE_COLUMNS},side` as const)
    .eq('fixture_id', fixtureId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) {
    q = q.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`)
  }
  const { data, error } = await q
  if (error || !data) return null
  return data.reverse().map((m) => ({ ...m, side: m.side === 'a' ? 'a' : 'h' }))
}
