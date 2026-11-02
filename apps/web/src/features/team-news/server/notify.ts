import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPush } from '@/features/push/server/send'
import { teamById } from '@/features/teams/data'

const PAGE = 1000

/**
 * Push a "new post" notification to every fan of the club that has a push subscription. Fire-and-forget from the
 * create-post action: resolves recipients with the service-role keyset RPC, pages them, then hands the full set to
 * sendPush (which chunks + rate-limits internally and never throws). Never throws — a push failure must not fail a post.
 */
export async function notifyNewPost(club: string, post: { title: string | null; body: string }): Promise<void> {
  try {
    const admin = createAdminClient()
    if (!admin) return
    const ids: string[] = []
    let after: string | undefined
    for (;;) {
      const { data, error } = await admin.rpc('channel_post_recipients', { p_club: club, p_after: after, p_limit: PAGE })
      if (error) return
      const page = (data ?? []) as string[]
      ids.push(...page)
      if (page.length < PAGE) break
      after = page[page.length - 1]
    }
    if (ids.length === 0) return
    const team = teamById(club)
    await sendPush(ids, {
      title: team ? `עדכון חדש · ${team.short}` : 'עדכון חדש',
      body: (post.title?.trim() || post.body).slice(0, 120),
      url: '/stand/chat?tab=news',
      tag: `channel:${club}`,
    })
  } catch {
    // never let a push failure fail the post
  }
}
