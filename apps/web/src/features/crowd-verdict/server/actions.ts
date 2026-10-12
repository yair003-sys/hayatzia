'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { crowdErrorHe, tickSchema, voteSchema } from '../schema'
import { getCrowd } from './queries'

/** The database checks the poll is open, the option exists and the fan may vote, and stamps the fan's group. */
export const voteAction = actionClient
  .inputSchema(voteSchema)
  .action(async ({ parsedInput: { pollId, option, optionIn } }): Promise<{ ok: true } | { error: string }> => {
    const supabase = await createClient()
    if (!supabase) return { error: 'ההצבעה לא זמינה בסביבה הזאת' }
    const change = { option_id: option, option_in: optionIn ?? null }
    // Changing a vote is an update (fans may not rewrite poll_id); a first vote is an insert.
    const upd = await supabase.from('match_poll_votes').update(change).eq('poll_id', pollId).select('poll_id')
    if (upd.error) return { error: crowdErrorHe(upd.error.message) }
    if (upd.data.length) return { ok: true }
    const ins = await supabase.from('match_poll_votes').insert({ poll_id: pollId, ...change })
    if (ins.error) return { error: crowdErrorHe(ins.error.message) }
    return { ok: true }
  })

/** Closes expired polls and opens the next queued one. Idempotent: any client may call it when a countdown ends. */
export const tickAction = actionClient.inputSchema(tickSchema).action(async ({ parsedInput: { fixtureId } }) => {
  const supabase = await createClient()
  if (!supabase) return { ok: false }
  const { error } = await supabase.rpc('crowd_tick', { p_fixture: fixtureId })
  return { ok: !error }
})

/** Re-reads the match's polls when a client notices it missed a broadcast (e.g. while reconnecting). */
export const refreshCrowdAction = actionClient
  .inputSchema(tickSchema)
  .action(async ({ parsedInput: { fixtureId } }) => getCrowd(fixtureId))
