import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ThreadSummary } from '../schema'

/** The fan's conversations, newest first. Metadata only: message contents are never read on the server. */
export async function getThreads(userId: string): Promise<ThreadSummary[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase
    .from('dm_threads')
    .select('id,user_a,user_b,nick_a,nick_b,last_at,last_from')
    .order('last_at', { ascending: false })
    .limit(100)
  const { data: blocks } = await supabase.from('blocks').select('blocked_id')
  const blocked = new Set(blocks?.map((b) => b.blocked_id))
  return (data ?? [])
    .map((t) => {
      const mineA = t.user_a === userId
      return {
        id: t.id,
        otherId: mineA ? t.user_b : t.user_a,
        otherNick: mineA ? t.nick_b : t.nick_a,
        lastAt: t.last_at,
        unreadHint: !!t.last_from && t.last_from !== userId,
      }
    })
    .filter((t) => !blocked.has(t.otherId))
}

export async function getThread(id: string, userId: string) {
  const supabase = await createClient()
  if (!supabase) return null
  const { data } = await supabase.from('dm_threads').select('id,user_a,user_b,nick_a,nick_b').eq('id', id).maybeSingle()
  if (!data) return null
  const mineA = data.user_a === userId
  return { id: data.id, otherId: mineA ? data.user_b : data.user_a, otherNick: mineA ? data.nick_b : data.nick_a }
}

/** Fans of the same club to start a conversation with (RLS shows only teammates' profiles). */
export async function searchTeammates(userId: string, q: string) {
  const supabase = await createClient()
  if (!supabase) return []
  let query = supabase.from('profiles').select('user_id,nick').neq('user_id', userId).order('nick').limit(30)
  if (q) query = query.ilike('nick', `%${q.replace(/[%_\\]/g, '\\$&')}%`)
  const { data } = await query
  return data ?? []
}
