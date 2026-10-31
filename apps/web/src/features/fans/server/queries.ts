import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { teamById, type Team } from '@/features/teams/data'

export type FanProfile = { userId: string; nick: string; team: Team; avatarUrl: string | null; coverUrl: string | null }

/**
 * Another fan's public card. RLS (`profiles_read_own_and_team`) lets a fan read their own row and their club-mates',
 * so this returns a profile only for a fan of the viewer's own club; anyone else (or a missing id) comes back null and
 * the page shows a "not available" state. The photo buckets are public, so a plain public URL is enough.
 */
export async function getFanProfile(userId: string): Promise<FanProfile | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data } = await supabase.from('profiles').select('nick,team_id,avatar_path,cover_path').eq('user_id', userId).maybeSingle()
  if (!data) return null
  const team = teamById(data.team_id)
  if (!team) return null
  return {
    userId,
    nick: data.nick,
    team,
    avatarUrl: data.avatar_path ? supabase.storage.from('avatars').getPublicUrl(data.avatar_path).data.publicUrl : null,
    coverUrl: data.cover_path ? supabase.storage.from('covers').getPublicUrl(data.cover_path).data.publicUrl : null,
  }
}
