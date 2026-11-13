import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { SONGS_PAGE, type Song } from '../schema'

const URL_TTL = 60 * 60 // seconds; feed pages are short-lived anyway
type DB = NonNullable<Awaited<ReturnType<typeof createClient>>>

// audio_path is selected for signing only — it never reaches the client.
const COLS = 'id,user_id,team_id,nick,title,lyrics,likes_count,adopts_count,created_at,audio_path'

type Row = {
  id: string
  user_id: string
  team_id: string
  nick: string
  title: string
  lyrics: string
  likes_count: number
  adopts_count: number
  created_at: string
  audio_path: string
}

/** The fan's own club greenhouse (RLS scopes it to their club), newest first. */
export async function getSongs(opts: { offset?: number } = {}): Promise<Song[] | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const from = opts.offset ?? 0
  const { data: rows, error } = await supabase
    .from('songs')
    .select(COLS)
    .order('created_at', { ascending: false })
    .range(from, from + SONGS_PAGE - 1)
  if (error || !rows) return null
  return decorate(supabase, rows as Row[], user.id)
}

export async function getSong(id: string): Promise<Song | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: row } = await supabase.from('songs').select(COLS).eq('id', id).maybeSingle()
  if (!row) return null
  const [song] = await decorate(supabase, [row as Row], user.id)
  return song ?? null
}

/** Sign the audio URLs and mark which songs the fan has liked / adopted — all in parallel. */
async function decorate(supabase: DB, rows: Row[], _me: string): Promise<Song[]> {
  const ids = rows.map((r) => r.id)
  const paths = rows.map((r) => r.audio_path)
  const [signed, likes, adopts] = await Promise.all([
    paths.length ? supabase.storage.from('songs').createSignedUrls(paths, URL_TTL) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('song_likes').select('song_id').in('song_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('song_adopts').select('song_id').in('song_id', ids) : Promise.resolve({ data: [] }),
  ])
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]))
  const liked = new Set((likes.data ?? []).map((l) => l.song_id))
  const adopted = new Set((adopts.data ?? []).map((a) => a.song_id))
  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    team_id: r.team_id,
    nick: r.nick,
    title: r.title,
    lyrics: r.lyrics,
    likes_count: r.likes_count,
    adopts_count: r.adopts_count,
    created_at: r.created_at,
    url: urlByPath.get(r.audio_path) ?? null,
    liked: liked.has(r.id),
    adopted: adopted.has(r.id),
  }))
}
