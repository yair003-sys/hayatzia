import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getBlockedIds } from '@/features/safety/server/queries'
import { carLine, rideAge, type DriverTrust, type Gender, type RideAge } from '../ride-safety'

export type Trip = {
  id: string
  user_id: string
  nick: string
  fixture_id: number
  kind: 'offer' | 'seek' | 'meet'
  from_city: string
  depart_before_min: number
  seats: number
  cost: 'share' | 'free'
  note: string
  pickup: string
  women_only: boolean
  created_at: string
  /** `verified`: the requester's identity is verified (the badge on request rows, 2026-10-16). */
  requests: { user_id: string; nick: string; status: 'pending' | 'accepted' | 'declined'; verified: boolean }[]
  /** Trust facts about the trip's author (ride safety rule 5); null when the database did not return them. */
  driver: DriverTrust | null
  /** Ride verification of the author (2026-10-16): the badge and, on an offer, the car. */
  trust: TripTrust | null
  /** The car's plate: only for the driver and accepted riders (my_ride_plates), else null. */
  plate: string | null
}

export type TripTrust = { identity: boolean; driver: boolean; car: string | null }

/**
 * Trips of the fan's club for the given matches, with the requests the fan may see (own, or all when driver). `me` is
 * the signed-in fan (for the plates of rides they drive or ride in).
 */
export async function getTrips(fixtureIds: number[], me?: string): Promise<Trip[]> {
  const supabase = await createClient()
  if (!supabase || fixtureIds.length === 0) return []
  const [{ data: trips }, blocked] = await Promise.all([
    supabase
      .from('trips')
      .select('id,user_id,nick,fixture_id,kind,from_city,depart_before_min,seats,cost,note,pickup,women_only,created_at')
      .in('fixture_id', fixtureIds)
      .order('created_at', { ascending: false })
      .limit(200),
    getBlockedIds(),
  ])
  const list = (trips ?? []).filter((t) => !blocked.includes(t.user_id))
  if (!list.length) return []
  const [{ data: reqs }, { data: drivers }] = await Promise.all([
    supabase
      .from('trip_requests')
      .select('trip_id,user_id,nick,status')
      .in('trip_id', list.map((t) => t.id)),
    supabase.rpc('ride_drivers', { p_users: [...new Set(list.map((t) => t.user_id))] }),
  ])
  // One call each for the badges (authors and requesters) and for the plates of rides I drive or ride in.
  const people = [...new Set([...list.map((t) => t.user_id), ...(reqs ?? []).map((r) => r.user_id)])].slice(0, 200)
  const mineOrAccepted = list
    .filter((t) => !!me && (t.user_id === me || (reqs ?? []).some((r) => r.trip_id === t.id && r.user_id === me && r.status === 'accepted')))
    .map((t) => t.id)
  const [{ data: trustRows }, { data: plates }] = await Promise.all([
    supabase.rpc('ride_trust', { p_users: people }),
    mineOrAccepted.length ? supabase.rpc('my_ride_plates', { p_trips: mineOrAccepted }) : Promise.resolve({ data: [] }),
  ])
  const verified = new Map(
    (trustRows ?? []).map((r) => [r.user_id, { identity: r.identity_ok, driver: r.driver_ok, car: carLine(r.car_make, r.car_model, r.car_colour) }]),
  )
  const plateOf = new Map((plates ?? []).map((p) => [p.trip_id, p.plate]))
  const trust = new Map(
    (drivers ?? []).map((d) => [
      d.user_id,
      {
        memberSince: d.member_since,
        ridesCompleted: d.rides_completed,
        ratingsCount: d.ratings_count,
        ratingsSum: d.ratings_sum,
        female: d.female,
      } satisfies DriverTrust,
    ]),
  )
  return list.map((t) => ({
    ...(t as Omit<Trip, 'requests' | 'driver' | 'trust' | 'plate'>),
    requests: (reqs ?? [])
      .filter((r) => r.trip_id === t.id)
      .map((r) => ({ ...r, verified: verified.get(r.user_id)?.identity ?? false })) as Trip['requests'],
    driver: trust.get(t.user_id) ?? null,
    trust: verified.get(t.user_id) ?? null,
    plate: plateOf.get(t.id) ?? null,
  }))
}

export type RideProfile = {
  gender: Gender | null
  adultConfirmed: boolean
  /** From the birth date: what the safety screen shows (18+ tap no longer exists). */
  age: RideAge
  safetySeen: boolean
  suspended: boolean
  phoneRequired: boolean
  phoneOk: boolean
}

/** The fan's own ride state (gender, 18+, safety screen, suspension, phone rule), through my_ride_profile(). */
export async function getMyRideProfile(): Promise<RideProfile | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const [{ data, error }, priv] = await Promise.all([supabase.rpc('my_ride_profile'), supabase.rpc('my_private_profile')])
  const row = data?.[0]
  if (error || !row) return null
  return {
    gender: row.gender === 'm' || row.gender === 'f' || row.gender === 'x' ? row.gender : null,
    adultConfirmed: row.adult_confirmed,
    age: rideAge(priv.data?.[0]?.birth_date ?? null),
    safetySeen: row.safety_seen,
    suspended: row.ride_suspended,
    phoneRequired: row.phone_required,
    phoneOk: row.phone_ok,
  }
}

export type RideToRate = { tripId: string; driverNick: string; kickoffAt: string }

/**
 * Rides of the last 30 days where the fan was an accepted rider of a ride offer, the match is over and the fan has not
 * rated yet (rule 6). Through my_rides_to_rate() (security definer), so a driver suspended from rides can still be rated.
 */
export async function getRidesToRate(): Promise<RideToRate[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data, error } = await supabase.rpc('my_rides_to_rate')
  if (error || !data) return []
  return data.map((r) => ({ tripId: r.trip_id, driverNick: r.driver_nick, kickoffAt: r.kickoff_at }))
}

export type FanEvent = {
  id: string
  user_id: string
  nick: string
  kind: 'screen' | 'march' | 'charity' | 'meet' | 'other'
  title: string
  starts_at: string
  area: string
  note: string
  going_count: number
  going: boolean
}

export async function getUpcomingEvents(): Promise<FanEvent[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const since = new Date(Date.now() - 3 * 3600_000).toISOString()
  const [{ data }, blocked] = await Promise.all([
    supabase
      .from('fan_events')
      .select('id,user_id,nick,kind,title,starts_at,area,note,going_count')
      .gte('starts_at', since)
      .order('starts_at')
      .limit(100),
    getBlockedIds(),
  ])
  const list = (data ?? []).filter((e) => !blocked.includes(e.user_id))
  if (!list.length) return []
  const { data: mine } = await supabase.from('fan_event_going').select('event_id').in('event_id', list.map((e) => e.id))
  const going = new Set(mine?.map((g) => g.event_id))
  return list.map((e) => ({ ...(e as Omit<FanEvent, 'going'>), going: going.has(e.id) }))
}

export type MarketItem = {
  id: string
  user_id: string
  nick: string
  category: 'shirt' | 'scarf' | 'flag' | 'memo' | 'other'
  title: string
  size: string
  condition: 'new' | 'like_new' | 'used'
  price: number
  sold: boolean
  created_at: string
  url: string | null
}

export async function getMarket(category?: string): Promise<MarketItem[]> {
  const supabase = await createClient()
  if (!supabase) return []
  let q = supabase
    .from('market_items')
    .select('id,user_id,nick,category,title,size,condition,price,sold,created_at,media_path')
    .order('sold')
    .order('created_at', { ascending: false })
    .limit(60)
  if (category) q = q.eq('category', category)
  const [{ data }, blocked] = await Promise.all([q, getBlockedIds()])
  const list = (data ?? []).filter((i) => !blocked.includes(i.user_id))
  const paths = list.map((i) => i.media_path).filter((p): p is string => !!p)
  const signed = paths.length ? (await supabase.storage.from('market').createSignedUrls(paths, 3600)).data : []
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
  return list.map(({ media_path, ...i }) => ({ ...(i as Omit<MarketItem, 'url'>), url: media_path ? (urls.get(media_path) ?? null) : null }))
}
