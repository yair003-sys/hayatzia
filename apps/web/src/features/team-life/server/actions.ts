'use server'

import { revalidatePath } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { sendPush } from '@/features/push/server/send'
import { decideSchema, eventSchema, goingSchema, idSchema, itemSchema, tripSchema } from '../schema'

async function db() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
const limitMsg = (m: string, fallback: string) => (m.includes('rate_limit') ? 'יותר מדי פרסומים בשעה האחרונה' : fallback)

export const createTripAction = actionClient.inputSchema(tripSchema).action(async ({ parsedInput: p }) => {
  const { error } = await (await db()).from('trips').insert({
    fixture_id: p.fixtureId,
    kind: p.kind,
    from_city: p.fromCity,
    depart_before_min: p.departBeforeMin,
    seats: p.kind === 'offer' ? p.seats : 0,
    cost: p.cost,
    note: p.note,
  })
  if (error) return { error: limitMsg(error.message, 'הפרסום נכשל') }
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

export const requestSeatAction = actionClient.inputSchema(idSchema).action(async ({ parsedInput: { id } }) => {
  const supabase = await db()
  const { error } = await supabase.from('trip_requests').insert({ trip_id: id })
  if (error && error.code !== '23505') return { error: limitMsg(error.message, 'הבקשה לא נשלחה') }
  if (!error) {
    const { data: t } = await supabase.from('trips').select('user_id').eq('id', id).maybeSingle()
    if (t) await sendPush([t.user_id], { title: 'בקשה לטרמפ', body: 'אוהד ביקש להצטרף לנסיעה שלך', url: '/stand/trips', tag: `trip:${id}` })
  }
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

export const decideSeatAction = actionClient.inputSchema(decideSchema).action(async ({ parsedInput: p }) => {
  const { error } = await (await db())
    .from('trip_requests')
    .update({ status: p.accept ? 'accepted' : 'declined' })
    .eq('trip_id', p.tripId)
    .eq('user_id', p.userId)
  if (error) return { error: error.message.includes('trip_full') ? 'הנסיעה מלאה' : 'לא הצלחנו לשמור' }
  await sendPush([p.userId], {
    title: p.accept ? 'אושרת לנסיעה 🚗' : 'הבקשה לנסיעה נדחתה',
    body: p.accept ? 'יש לך מקום. תתאמו פרטים בהודעה.' : 'אפשר לחפש נסיעה אחרת',
    url: '/stand/trips',
    tag: `trip:${p.tripId}`,
  })
  revalidatePath('/stand/trips')
  return { ok: true as const }
})

export const deleteTripAction = actionClient.inputSchema(idSchema).action(async ({ parsedInput: { id } }) => {
  await (await db()).from('trips').delete().eq('id', id)
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
