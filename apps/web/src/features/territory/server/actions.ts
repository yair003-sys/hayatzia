'use server'

import { latLngToCell } from 'h3-js'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureSchema, COOLDOWN_MS, H3_RES, MAX_ACCURACY_M, MAX_SPEED_KMH, type CaptureResult } from '../schema'

/** Great-circle distance in metres. */
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Capture the hex cell the fan is standing in. The cell id is computed here, server-side, from the device coordinates,
 * so a client can never claim a cell it is not in. The checks — accuracy gate, teleport (impossible travel since the
 * last capture), one-hour cooldown — all run here, and the write uses the service role because `territory` is read-only
 * to clients. Good enough against casual spoofing in a web app; a determined spoofer needs native defences (noted).
 */
export const captureTerritoryAction = actionClient.inputSchema(captureSchema).action(async ({ parsedInput: { lat, lng, accuracy } }): Promise<CaptureResult> => {
  const supabase = await createClient()
  if (!supabase) return { ok: false, reason: 'error', message: 'השרת לא מחובר.' }
  const { data: claims } = await supabase.auth.getClaims()
  const uid = claims?.claims.sub
  if (!uid) return { ok: false, reason: 'error', message: 'צריך להתחבר.' }

  if (accuracy > MAX_ACCURACY_M) {
    return { ok: false, reason: 'accuracy', message: `ה-GPS לא מדויק מספיק (±${Math.round(accuracy)} מ׳). צאו לאוויר הפתוח ונסו שוב.` }
  }

  const { data: me } = await supabase.from('profiles').select('team_id,nick').eq('user_id', uid).maybeSingle()
  if (!me) return { ok: false, reason: 'error', message: 'לא נמצא פרופיל.' }

  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: 'error', message: 'הכיבוש לא זמין בסביבה הזאת.' }

  const h3 = latLngToCell(lat, lng, H3_RES)

  // Teleport check: compare with my most recent capture.
  const { data: last } = await admin
    .from('territory_log')
    .select('lat,lng,captured_at')
    .eq('user_id', uid)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (last) {
    const dtHours = (Date.now() - new Date(last.captured_at).getTime()) / 3_600_000
    const km = distanceM(last.lat, last.lng, lat, lng) / 1000
    if (dtHours > 0 && km / dtHours > MAX_SPEED_KMH) {
      return { ok: false, reason: 'teleport', message: 'זיהינו תנועה מהירה מדי. נסו שוב בעוד רגע.' }
    }
  }

  // Cooldown: a held cell is locked for an hour, whoever holds it.
  const { data: cur } = await admin.from('territory').select('team_id,captured_at').eq('h3', h3).maybeSingle()
  if (cur) {
    const age = Date.now() - new Date(cur.captured_at).getTime()
    if (age < COOLDOWN_MS) {
      const until = new Date(new Date(cur.captured_at).getTime() + COOLDOWN_MS).toISOString()
      const mine = cur.team_id === me.team_id
      return { ok: false, reason: 'cooldown', message: mine ? 'האזור כבר שלכם — נעול לזמן מה.' : 'האזור נעול לזמן מה, נסו מאוחר יותר.', until }
    }
  }

  const capturedAt = new Date().toISOString()
  const { error: upErr } = await admin.from('territory').upsert({ h3, team_id: me.team_id, user_id: uid, nick: me.nick, captured_at: capturedAt })
  if (upErr) return { ok: false, reason: 'error', message: 'לא הצלחנו לכבוש כרגע.' }
  await admin.from('territory_log').insert({ user_id: uid, h3, lat, lng, captured_at: capturedAt })

  return { ok: true, cell: { h3, teamId: me.team_id, nick: me.nick, capturedAt } }
})
