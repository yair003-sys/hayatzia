'use server'

import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { decodeCursor } from '../activity'
import { getActivityPage } from './queries'

/**
 * Records the fan's visit up to `upto`: the newest updated_at the list showed. Rows that change after it stay unread
 * (the database clamps it to its clock and never moves it backwards). Own row only (the RPC).
 */
export const markActivitySeenAction = actionClient
  .inputSchema(z.object({ upto: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s))) }))
  .action(async ({ parsedInput }) => {
    const supabase = await createClient()
    if (!supabase) return { ok: false as const }
    const { error } = await supabase.rpc('mark_activity_seen', { p_upto: parsedInput.upto })
    return { ok: !error }
  })

/** The next page of the list ("עוד"), after the given keyset cursor. */
export const loadMoreActivityAction = actionClient.inputSchema(z.object({ cursor: z.string().max(120) })).action(async ({ parsedInput }) => {
  const before = decodeCursor(parsedInput.cursor)
  const supabase = await createClient()
  const { data: claims } = (await supabase?.auth.getClaims()) ?? { data: null }
  const me = claims?.claims.sub
  if (!before || !me) return { items: [], next: null }
  const page = await getActivityPage(me, before)
  // A failed read is not "no more rows": the list shows "could not load" and keeps its "more" button.
  if (!page) return null
  return { items: page.items, next: page.next }
})
