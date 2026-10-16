'use server'

import { revalidatePath } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendPush } from '@/features/push/server/send'
import { blockSchema, contactSchema, isRideHarm, reportSchema } from '../schema'

const rateLimited = (m: string) => m.includes('rate_limit')

/** Files a report for the moderators. Fans can never read reports back (no select grant). */
export const reportAction = actionClient.inputSchema(reportSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  if (isRideHarm(parsedInput.kind, parsedInput.reason)) {
    // Through the database function: same row and rules, plus whether it suspended someone.
    const { data, error } = await supabase.rpc('report_ride_harm', {
      p_kind: parsedInput.kind,
      p_ref: parsedInput.ref,
      p_note: parsedInput.note,
    })
    if (error) return { error: rateLimited(error.message) ? 'שלחת הרבה דיווחים היום. תודה!' : 'הדיווח לא נשלח' }
    const row = data?.[0]
    await notifyRideHarm(row?.report_id ?? null, row?.suspended === true)
    return { ok: true as const }
  }
  const { error } = await supabase.from('reports').insert(parsedInput)
  if (error) return { error: rateLimited(error.message) ? 'שלחת הרבה דיווחים היום. תודה!' : 'הדיווח לא נשלח' }
  return { ok: true as const }
})

/**
 * Harm during a ride (ride safety, rule 9). Every admin gets a phone notification now; it says the fan was suspended
 * from rides only when the database really suspended them. When it did, the accepted riders of the suspended driver's
 * upcoming rides are told the ride is off for now. Ids are read with the service key (both functions are closed to
 * fans); no detail about the people involved goes into any notification. Never fails the report.
 */
async function notifyRideHarm(reportId: string | null, suspended: boolean) {
  const admin = createAdminClient()
  if (!admin) return
  const { data: admins, error } = await admin.rpc('admin_user_ids')
  if (!error && admins?.length) {
    await sendPush(admins, {
      title: 'דיווח דחוף על נסיעה',
      body: suspended ? 'התקבל דיווח על הטרדה או פגיעה בנסיעה. האוהד הושעה מנסיעות עד לבדיקה' : 'דיווח דחוף על נסיעה לבדיקה',
      url: '/admin/reports',
      tag: 'ride-harm',
    })
  }
  if (!suspended || !reportId) return
  const { data: riders, error: ridersError } = await admin.rpc('ride_suspension_riders', { p_report: reportId })
  if (ridersError || !riders?.length) return
  await sendPush(riders, {
    title: 'הנסיעה בוטלה זמנית',
    body: 'הנהג לא זמין כרגע לנסיעות. כדאי למצוא נסיעה אחרת למשחק',
    url: '/stand/trips',
    tag: 'ride-off',
  })
}

/** "צור קשר": a request to the operator, stored as a report of kind 'contact' (topic in `reason`, text in `note`). */
export const contactAction = actionClient.inputSchema(contactSchema).action(async ({ parsedInput: { topic, text } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.from('reports').insert({ kind: 'contact', ref: '', reason: topic, note: text })
  if (error) return { error: rateLimited(error.message) ? 'שלחת הרבה פניות היום. נסה שוב מחר' : 'הפנייה לא נשלחה. נסה שוב' }
  return { ok: true as const }
})

export const blockAction = actionClient.inputSchema(blockSchema).action(async ({ parsedInput: { userId, on } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = on
    ? await supabase.from('blocks').insert({ blocked_id: userId })
    : await supabase.from('blocks').delete().eq('blocked_id', userId)
  if (error && error.code !== '23505') return { error: 'לא הצלחנו לשמור' }
  revalidatePath('/inbox')
  return { ok: true as const }
})
