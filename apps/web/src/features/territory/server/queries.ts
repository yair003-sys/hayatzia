import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Cell } from '../schema'

/** Every held cell, for drawing the map. MVP loads the whole board (capped); a bounding-box read comes with scale. */
export async function getTerritory(): Promise<Cell[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase.from('territory').select('h3,team_id,nick,captured_at').limit(5000)
  return (data ?? []).map((r) => ({ h3: r.h3, teamId: r.team_id, nick: r.nick, capturedAt: r.captured_at }))
}
