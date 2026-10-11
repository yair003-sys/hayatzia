import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { PHOTOS_PAGE, type PhotoComment, type StandPhoto } from '../schema'

/** The club's stand photos, newest first (keyset). Team-private by RLS; signed URLs for 1 hour. */
export async function getStandPhotos(before?: { createdAt: string; id: string }): Promise<StandPhoto[]> {
  const supabase = await createClient()
  if (!supabase) return []
  let q = supabase
    .from('team_photos')
    .select('id,user_id,nick,media_path,caption,likes_count,comments_count,created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PHOTOS_PAGE)
  if (before) q = q.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`)
  const { data: rows } = await q
  if (!rows?.length) return []
  const [likes, signed] = await Promise.all([
    supabase.from('team_photo_likes').select('photo_id').in('photo_id', rows.map((r) => r.id)),
    supabase.storage.from('stand').createSignedUrls(rows.map((r) => r.media_path), 3600),
  ])
  const liked = new Set(likes.data?.map((l) => l.photo_id))
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]))
  return rows.map(({ media_path, ...r }) => ({ ...r, url: urls.get(media_path) ?? null, liked: liked.has(r.id) }))
}

export async function getPhotoComments(photoId: string): Promise<PhotoComment[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase
    .from('team_photo_comments')
    .select('id,user_id,nick,body,created_at')
    .eq('photo_id', photoId)
    .order('created_at')
    .limit(100)
  return data ?? []
}
