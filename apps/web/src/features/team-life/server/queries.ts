import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getBlockedIds } from '@/features/safety/server/queries'

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
  created_at: string
  requests: { user_id: string; nick: string; status: 'pending' | 'accepted' | 'declined' }[]
}

/** Trips of the fan's club for the given matches, with the requests the fan may see (own, or all when driver). */
export async function getTrips(fixtureIds: number[]): Promise<Trip[]> {
  const supabase = await createClient()
  if (!supabase || fixtureIds.length === 0) return []
  const [{ data: trips }, blocked] = await Promise.all([
    supabase
      .from('trips')
      .select('id,user_id,nick,fixture_id,kind,from_city,depart_before_min,seats,cost,note,created_at')
      .in('fixture_id', fixtureIds)
      .order('created_at', { ascending: false })
      .limit(200),
    getBlockedIds(),
  ])
  const list = (trips ?? []).filter((t) => !blocked.includes(t.user_id))
  if (!list.length) return []
  const { data: reqs } = await supabase
    .from('trip_requests')
    .select('trip_id,user_id,nick,status')
    .in('trip_id', list.map((t) => t.id))
  return list.map((t) => ({
    ...(t as Omit<Trip, 'requests'>),
    requests: (reqs ?? []).filter((r) => r.trip_id === t.id) as Trip['requests'],
  }))
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
