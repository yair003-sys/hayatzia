// Removes Square posts older than 24 hours: their files in Storage, then the rows (likes/views/comments cascade).
// RLS already hides them the moment they expire; this frees the space. Also deletes orphan files in the clips bucket
// (an object with no matching clips row, older than an hour — a failed upload). Runs hourly (web-cleanup.yml).
// Run: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/cleanup-clips.ts
import { notice, supabaseFromEnv } from './lib/rest.ts'

const BATCH = 200
const { rest, rpc, storage } = supabaseFromEnv()
let removed = 0
let orphans = 0

for (;;) {
  const now = encodeURIComponent(new Date().toISOString())
  const res = await rest('GET', `clips?select=id,media_path&expires_at=lt.${now}&order=expires_at&limit=${BATCH}`)
  const expired = (await res.json()) as { id: string; media_path: string }[]
  if (expired.length === 0) break
  await storage('DELETE', 'object/clips', { prefixes: expired.map((c) => c.media_path) })
  await rest('DELETE', `clips?id=in.(${expired.map((c) => c.id).join(',')})`)
  removed += expired.length
  if (expired.length < BATCH) break
}

// Orphans: files with no clips row, older than an hour (the database picks them; this only deletes the objects).
for (;;) {
  const res = await rpc('orphan_clip_objects', { p_limit: BATCH })
  const rows = (await res.json()) as { name: string }[]
  if (rows.length === 0) break
  await storage('DELETE', 'object/clips', { prefixes: rows.map((r) => r.name) })
  orphans += rows.length
  if (rows.length < BATCH) break
}

notice('cleanup', `expired clips removed: ${removed}; orphan files removed: ${orphans}`)
