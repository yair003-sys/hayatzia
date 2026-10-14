'use server'

import { clipIdSchema } from '@/features/square/schema'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'

/**
 * A story was shown: record my view (clip_views, the same row the Square writes), so its ring turns grey next time.
 * Seen already (23505) is fine. RLS allows it only for a post I may see.
 */
export const markStorySeenAction = actionClient.inputSchema(clipIdSchema).action(async ({ parsedInput: { clipId } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.from('clip_views').insert({ clip_id: clipId })
  return error && error.code !== '23505' ? { error: 'לא נשמר' } : { ok: true as const }
})
