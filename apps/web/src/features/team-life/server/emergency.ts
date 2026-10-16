'use server'

import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendPush } from '@/features/push/server/send'
import { getLeague } from '@/features/matches/server/queries'
import { rideErrorHe } from '../ride-safety'
import { matchLabelOf } from './matches'

const emergencySchema = z.strictObject({ tripId: z.uuid() })

/**
 * The emergency button (2026-10-16). The phone dials 100 by itself (tel: link); this records the incident
 * (report_ride_emergency: participants only, in the ride's time window, once per fan per trip per 10 minutes) and, for a
 * new incident only, pushes every admin "חירום בנסיעה" with the route and nothing else. The push never fails the action.
 */
export const reportEmergencyAction = actionClient.inputSchema(emergencySchema).action(async ({ parsedInput: { tripId } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא הצלחנו להודיע לצוות. בחירום חייגו 100' }
  const { data, error } = await supabase.rpc('report_ride_emergency', { p_trip: tripId })
  if (error) return { error: rideErrorHe(error.message) ?? 'לא הצלחנו להודיע לצוות. בחירום חייגו 100' }
  const row = data?.[0]
  if (row?.created) await notifyAdmins(row.incident_id, row.from_city, row.fixture_id)
  return { ok: true as const, created: !!row?.created }
})

async function notifyAdmins(incidentId: string, fromCity: string, fixtureId: number) {
  const admin = createAdminClient()
  if (!admin) return
  const { data: admins, error } = await admin.rpc('admin_user_ids')
  if (error || !admins?.length) return
  const label = matchLabelOf(await getLeague(), fixtureId)
  await sendPush(admins, {
    title: 'חירום בנסיעה',
    body: `${fromCity} → ${label}`,
    url: '/admin/reports',
    tag: `ride-emergency:${incidentId}`,
  })
}
