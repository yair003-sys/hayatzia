import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/** Fans the current fan blocked. Their posts and messages are hidden everywhere. Per request. */
export const getBlockedIds = cache(async (): Promise<string[]> => {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase.from('blocks').select('blocked_id')
  return data?.map((b) => b.blocked_id) ?? []
})
