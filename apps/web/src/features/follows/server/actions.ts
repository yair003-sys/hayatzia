'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { toggleFollowSchema } from '../schema'

async function db() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/**
 * Follow or unfollow another fan. Row-level security pins the follower to the caller, so a fan can only ever add or
 * remove their own edge; the per-profile counters are kept by a trigger. Following crosses clubs by design.
 */
export const toggleFollowAction = actionClient.inputSchema(toggleFollowSchema).action(async ({ parsedInput: { followeeId, on } }) => {
  const supabase = await db()
  const { error } = on
    ? await supabase.from('follows').insert({ followee_id: followeeId })
    : await supabase.from('follows').delete().eq('followee_id', followeeId)
  // 23505 = already following (a double tap) — harmless, treat as done.
  if (error && error.code !== '23505') return { error: 'לא הצלחנו לעדכן את המעקב' }
  return { ok: true as const }
})
