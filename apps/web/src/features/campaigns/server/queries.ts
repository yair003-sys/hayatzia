import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/supabase/database.types'

export type Campaign = Tables<'campaigns'>

// Discovery: live campaigns, soonest deadline first (served by the partial index). RLS already limits a public read
// to live/finished campaigns, so no fan ever sees a draft here.
export async function getLiveCampaigns(limit = 20): Promise<Campaign[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('status', 'live')
    .order('deadline', { ascending: true })
    .limit(limit)
  return data ?? []
}

// One campaign. RLS decides visibility: anyone sees it once live/finished; only the organizer or an admin sees a
// draft or in-review one. Returns null when it isn't visible to this viewer or doesn't exist.
export async function getCampaign(id: string): Promise<Campaign | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle()
  return data ?? null
}

// The viewer's own active pledge total to a campaign (for "already backed" state). Their own rows only (RLS).
export async function getMyPledgeAgorot(campaignId: string): Promise<number> {
  const supabase = await createClient()
  if (!supabase) return 0
  const { data } = await supabase
    .from('campaign_contributions')
    .select('amount_agorot,status')
    .eq('campaign_id', campaignId)
    .in('status', ['held', 'captured'])
  return (data ?? []).reduce((sum, c) => sum + c.amount_agorot, 0)
}
