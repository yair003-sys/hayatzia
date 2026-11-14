import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { teamById, type Team } from '@/features/teams/data'
import { fanLabel } from '@/features/me/fan-identity'
import type { FanCard } from '@/features/me/schema'

export type FanProfile = { userId: string; nick: string; team: Team; avatarUrl: string | null; coverUrl: string | null }

/** A fan's full public card plus the follow state — the same for a club-mate or a rival (2026-11-14). */
export type PublicFanCard = {
  userId: string
  nick: string
  team: Team
  avatarUrl: string | null
  coverUrl: string | null
  card: FanCard
  followers: number
  following: number
  iFollow: boolean
}

/**
 * Any fan's public card, across clubs. The `fan_card` database function (SECURITY DEFINER) returns only the public
 * aggregate fields — profile basics, play stats, follow counters, and whether the caller follows them — so the card
 * opens for a rival-club fan without exposing any club-scoped row. A missing/invalid id comes back null.
 */
export async function getPublicFanCard(userId: string, season: number | null): Promise<PublicFanCard | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data } = await supabase.rpc('fan_card', { p_user: userId, p_season: season ?? undefined })
  const row = data?.[0]
  if (!row) return null
  const team = teamById(row.team_id)
  if (!team) return null
  const url = (bucket: string, path: string | null) => (path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null)
  return {
    userId,
    nick: row.nick,
    team,
    avatarUrl: url('avatars', row.avatar_path),
    coverUrl: url('covers', row.cover_path),
    card: {
      joinedAt: row.created_at,
      number: row.join_number,
      games: row.games,
      away: row.away,
      points: row.points,
      exact: row.exact,
      rank: row.rank,
      rated: row.rated,
      label: fanLabel({ games: row.games, tactical: row.rated + row.exact, uploads: row.clips_posted }),
    },
    followers: row.followers_count,
    following: row.following_count,
    iFollow: row.i_follow,
  }
}

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
