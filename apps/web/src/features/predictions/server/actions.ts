'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { guessSchema, predictionErrorHe } from '../schema'

/** Save or change a guess. The database refuses after kick-off and stamps the fan's club. */
export const saveGuessAction = actionClient
  .inputSchema(guessSchema)
  .action(async ({ parsedInput: { fixtureId, home, away } }): Promise<{ ok: true } | { error: string }> => {
    const supabase = await createClient()
    if (!supabase) return { error: 'הניחושים לא זמינים בסביבה הזאת' }
    const upd = await supabase.from('predictions').update({ home_goals: home, away_goals: away }).eq('fixture_id', fixtureId).select('fixture_id')
    if (upd.error) return { error: predictionErrorHe(upd.error.message) }
    if (upd.data.length) return { ok: true }
    const ins = await supabase.from('predictions').insert({ fixture_id: fixtureId, home_goals: home, away_goals: away })
    if (ins.error) return { error: predictionErrorHe(ins.error.message) }
    return { ok: true }
  })
