import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { sendPush } from '@/features/push/server/send'

/**
 * Push to a fan's followers when they post a new clip (owner 2026-11-14). Runs as the poster, who may read their own
 * follower edges (follows RLS: followee_id = me), so no elevated access is needed. Never throws and is a no-op until
 * push is configured (VAPID) — a notification must never block or break posting.
 */
export async function notifyFollowersNewClip(posterId: string, nick: string): Promise<void> {
  try {
    const supabase = await createClient()
    if (!supabase) return
    const { data } = await supabase.from('follows').select('follower_id').eq('followee_id', posterId)
    const ids = (data ?? []).map((r) => r.follower_id)
    if (ids.length === 0) return
    await sendPush(ids, {
      title: 'onefan',
      body: `${nick} פרסם רגע חדש בכיכר`,
      url: '/square?f=following',
      tag: `follow:${posterId}`,
    })
  } catch {
    /* notifications are a bonus, never a blocker */
  }
}
