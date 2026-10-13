import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_PREFS, toPrefs, type NotificationPrefs } from '../schema'

/** The signed-in fan's notification settings (own row by RLS; primary-key lookup). No row → defaults. */
export async function getMyPrefs(userId: string): Promise<NotificationPrefs> {
  const supabase = await createClient()
  if (!supabase) return DEFAULT_PREFS
  const { data } = await supabase.from('notification_prefs').select('matches,messages').eq('user_id', userId).maybeSingle()
  return toPrefs(data)
}
