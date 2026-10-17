import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Fans the current fan blocked, or null when the read failed (load test 2026-10-17, finding 6: a screen that cannot
 * hide blocked fans says "could not load" instead of showing them). Per request.
 */
export const getBlockedIdsOrNull = cache(async (): Promise<string[] | null> => {
  const supabase = await createClient()
  if (!supabase) return []
  const { data, error } = await supabase.from('blocks').select('blocked_id')
  if (error || !data) return null
  return data.map((b) => b.blocked_id)
})

/** Fans the current fan blocked. Their posts and messages are hidden everywhere. Per request. */
export const getBlockedIds = cache(async (): Promise<string[]> => (await getBlockedIdsOrNull()) ?? [])
