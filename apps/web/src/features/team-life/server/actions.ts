'use server'

import { moderationHe } from '@/lib/moderation'
import { revalidatePath } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import type { TablesInsert } from '@/lib/supabase/database.types'
import { sendPush } from '@/features/push/server/send'
import { tripAcceptedLine, tripHref, tripRequestLine, type TripKind } from '@/features/activity/activity'
import { decideSchema, eventSchema, genderSchema, goingSchema, idSchema, itemSchema, rateRideSchema, rideConsentSchema, tripSchema } from '../schema'
import { rideErrorHe } from '../ride-safety'

async function db() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
type Db = Awaited<ReturnType<typeof db>>
const limitMsg = (m: string, fallback: string) =>
  moderationHe(m) ?? rideErrorHe(m) ?? (m.includes('rate_limit') ? 'יותר מדי פרסומים בשעה האחרונה' : fallback)

export const createTripAction = actionClient.inputSchema(tripSchema).action(async ({ parsedInput: p }) => {
  const { error } = await (await db()).from('trips').insert({
    fixture_id: p.fixtureId,
    kind: p.kind,
    from_city: p.fromCity,
    depart_before_min: p.departBeforeMin,
    seats: p.kind === 'offer' ? p.seats : 0,
    cost: p.cost,
    note: p.note,
    pickup: p.pickup,
    women_only: p.womenOnly,
  })
  if (error) return { error: limitMsg(error.message, 'הפרסום נכשל') }
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

export const requestSeatAction = actionClient.inputSchema(idSchema).action(async ({ parsedInput: { id } }) => {
  const supabase = await db()
  const { error } = await supabase.from('trip_requests').insert({ trip_id: id })
  if (error && error.code !== '23505') return { error: limitMsg(error.message, 'הבקשה לא נשלחה') }
  if (!error) await pushTrip(supabase, 'trip_request', id)
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

export const decideSeatAction = actionClient.inputSchema(decideSchema).action(async ({ parsedInput: p }) => {
  const status = p.accept ? 'accepted' : 'declined'
  // Only a request that really changed is told (RLS: the trip's driver only; the same answer twice changes nothing).
  const { data: changed, error } = await (await db())
    .from('trip_requests')
    .update({ status })
    .eq('trip_id', p.tripId)
    .eq('user_id', p.userId)
    .neq('status', status)
    .select('user_id')
  if (error) return { error: error.message.includes('trip_full') ? 'הנסיעה מלאה' : limitMsg(error.message, 'לא הצלחנו לשמור') }
  if (changed?.length) {
    if (p.accept) await pushTrip(await db(), 'trip_accepted', p.tripId, p.userId)
    else {
      const supabase = await db()
      const { data: claims } = await supabase.auth.getClaims()
      const me = claims?.claims.sub
      const { data: blocked, error: blockErr } = me
        ? await supabase.rpc('blocked_between', { a: me, b: p.userId })
        : { data: true, error: null }
      if (!blockErr && !blocked)
        await sendPush([p.userId], { title: 'הבקשה לנסיעה נדחתה', body: 'אפשר לחפש נסיעה אחרת', url: '/stand/trips', tag: `trip:${p.tripId}` })
    }
  }
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

/**
 * The two trip events of the activity bell, as a phone notification to the one fan concerned (always on):
 * a request → the trip's driver, "<nick> ביקש להצטרף לנסיעה שלך"; an acceptance → the rider, "אושרת! הצטרפת לנסיעה
 * של <nick>". <nick> is the acting fan (me). Nothing else is sent. Same rules as the bell's rows: never to myself, and
 * not between fans blocked either way. sendPush never throws, so a failed notification never fails the action.
 */
async function pushTrip(supabase: Db, kind: TripKind, tripId: string, rider?: string) {
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  if (!me) return
  const [{ data: trip }, { data: profile }] = await Promise.all([
    supabase.from('trips').select('user_id').eq('id', tripId).maybeSingle(),
    supabase.from('profiles').select('nick').eq('user_id', me).maybeSingle(),
  ])
  const to = kind === 'trip_request' ? trip?.user_id : rider
  if (!trip || !to || to === me) return
  const { data: blocked, error } = await supabase.rpc('blocked_between', { a: me, b: to })
  if (error || blocked) return
  const nick = profile?.nick ?? null
  await sendPush([to], {
    title: kind === 'trip_request' ? tripRequestLine(nick) : tripAcceptedLine(nick),
    body: '',
    url: tripHref(tripId),
    tag: `trip:${tripId}`,
  })
}

/**
 * The one-time 18+ confirmation and safety screen (ride safety rules 2 and 8), on the fan's own row. The database stamps
 * both times itself and never clears them.
 */
export const confirmRideSafetyAction = actionClient.inputSchema(rideConsentSchema).action(async () => {
  const supabase = await db()
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  if (!me) return { error: 'צריך להתחבר מחדש' }
  const at = new Date().toISOString()
  // 18+ comes from the birth date since 2026-10-16; only the safety screen is recorded here (time stamped by the database).
  const { error } = await supabase.from('profiles').update({ ride_safety_seen_at: at }).eq('user_id', me)
  if (error) return { error: 'לא הצלחנו לשמור. נסה שוב' }
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

/** "הכרטיס שלי": self-declared gender, shown only in rides (rule 1). */
export const setGenderAction = actionClient.inputSchema(genderSchema).action(async ({ parsedInput: { gender } }) => {
  const supabase = await db()
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  if (!me) return { error: 'צריך להתחבר מחדש' }
  const { error } = await supabase.from('profiles').update({ gender }).eq('user_id', me)
  // Gender is set once: a second change is refused with gender_locked; show the "contact support" message, never the
  // generic retry (which could never succeed). The null→value first set is unaffected.
  if (error) return { error: rideErrorHe(error.message) ?? 'לא הצלחנו לשמור. נסה שוב' }
  revalidatePath('/me')
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

/** Rating the driver after the match, once (rule 6). The database checks rider, time and the single rating. */
export const rateRideAction = actionClient.inputSchema(rateRideSchema).action(async ({ parsedInput: { tripId, stars } }) => {
  // driver_id is NOT NULL but always stamped by the BEFORE INSERT trigger (ride_ratings_check) from the trip, so the
  // generated insert type asks for a value the client never sends and could not set anyway.
  const row = { trip_id: tripId, stars } as TablesInsert<'ride_ratings'>
  const { error } = await (await db()).from('ride_ratings').insert(row)
  if (error && error.code !== '23505') return { error: rideErrorHe(error.message) ?? 'הדירוג לא נשמר. נסה שוב' }
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

export const deleteTripAction = actionClient.inputSchema(idSchema).action(async ({ parsedInput: { id } }) => {
  // RLS keeps a ride that already left with riders, and every ride during an open ride case: then nothing is deleted.
  const { data, error } = await (await db()).from('trips').delete().eq('id', id).select('id')
  if (error || !data?.length) return { error: 'אי אפשר למחוק את הנסיעה הזאת: היא כבר יצאה לדרך או נמצאת בבירור' }
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

export const createEventAction = actionClient.inputSchema(eventSchema).action(async ({ parsedInput: p }) => {
  if (new Date(p.startsAt).getTime() < Date.now() - 3600_000) return { error: 'התאריך כבר עבר' }
  const { error } = await (await db())
    .from('fan_events')
    .insert({ kind: p.kind, title: p.title, starts_at: p.startsAt, area: p.area, note: p.note })
  if (error) return { error: limitMsg(error.message, 'האירוע לא נוצר') }
  revalidatePath('/stand/events')
  return { ok: true as const }
})

export const goingAction = actionClient.inputSchema(goingSchema).action(async ({ parsedInput: { id, on } }) => {
  const supabase = await db()
  const { error } = on
    ? await supabase.from('fan_event_going').insert({ event_id: id })
    : await supabase.from('fan_event_going').delete().eq('event_id', id)
  return error && error.code !== '23505' ? { error: 'לא הצלחנו לשמור' } : { ok: true as const }
})

export const deleteEventAction = actionClient.inputSchema(idSchema).action(async ({ parsedInput: { id } }) => {
  await (await db()).from('fan_events').delete().eq('id', id)
  revalidatePath('/stand/events')
  return { ok: true as const }
})

export const createItemAction = actionClient.inputSchema(itemSchema).action(async ({ parsedInput: p }) => {
  const supabase = await db()
  const { error } = await supabase.from('market_items').insert({
    category: p.category,
    title: p.title,
    size: p.size,
    condition: p.condition,
    price: p.price,
    media_path: p.path,
  })
  if (error) {
    if (p.path) await supabase.storage.from('market').remove([p.path])
    return { error: limitMsg(error.message, 'המודעה לא פורסמה') }
  }
  revalidatePath('/stand/market')
  return { ok: true as const }
})

export const markSoldAction = actionClient.inputSchema(idSchema).action(async ({ parsedInput: { id } }) => {
  await (await db()).from('market_items').update({ sold: true }).eq('id', id)
  revalidatePath('/stand/market')
  return { ok: true as const }
})

export const deleteItemAction = actionClient.inputSchema(idSchema).action(async ({ parsedInput: { id } }) => {
  const supabase = await db()
  const { data } = await supabase.from('market_items').select('media_path').eq('id', id).maybeSingle()
  await supabase.from('market_items').delete().eq('id', id)
  if (data?.media_path) await supabase.storage.from('market').remove([data.media_path])
  revalidatePath('/stand/market')
  return { ok: true as const }
})
