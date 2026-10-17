'use server'

import { updateTag } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { lineupErrorHe, saveLineupSchema } from '../schema'

/** Save (or replace) the fan's XI. The database checks the rest: own club's match, before kick-off, 11 of the club. */
export const saveFanLineupAction = actionClient
  .inputSchema(saveLineupSchema)
  .action(async ({ parsedInput: { fixtureId, formation, slots } }): Promise<{ ok: true } | { error: string }> => {
    const supabase = await createClient()
    if (!supabase) return { error: 'שמירת ההרכב לא זמינה בסביבה הזאת' }
    const { error } = await supabase.rpc('save_fan_lineup', {
      p_fixture: fixtureId,
      p_formation: formation,
      p_slots: slots.map((s) => ({ slot: s.slot, player_id: s.playerId })),
    })
    if (error) return { error: lineupErrorHe(error.message) }
    // The club's shared totals and fans' XI for this match (getLineupAggregates): the fan sees their pick counted.
    updateTag(`fan-lineup:${fixtureId}`)
    return { ok: true }
  })
