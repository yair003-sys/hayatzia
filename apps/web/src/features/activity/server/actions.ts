'use server'

import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { decodeCursor } from '../activity'
import { getActivityPage } from './queries'

/** Records the fan's visit to the list (the badge then counts only what changes after it). Own row only (the RPC). */
export const markActivitySeenAction = actionClient.action(async () => {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const }
  const { error } = await supabase.rpc('mark_activity_seen')
  return { ok: !error }
})

const moreSchema = z.object({
  cursor: z.string().max(120),
  /** The first page's view of the last visit, so older pages highlight the same way (cosmetic only). */
  seenAt: z.string().max(40).nullable(),
})

/** The next page of the list ("עוד"), after the given keyset cursor. */
export const loadMoreActivityAction = actionClient.inputSchema(moreSchema).action(async ({ parsedInput }) => {
  const before = decodeCursor(parsedInput.cursor)
  const seenAt = parsedInput.seenAt && !Number.isNaN(Date.parse(parsedInput.seenAt)) ? parsedInput.seenAt : null
  const supabase = await createClient()
  const { data: claims } = (await supabase?.auth.getClaims()) ?? { data: null }
  const me = claims?.claims.sub
  if (!before || !me) return { items: [], next: null }
  const page = await getActivityPage(me, { before, seenAt })
  return { items: page.items, next: page.next }
})
