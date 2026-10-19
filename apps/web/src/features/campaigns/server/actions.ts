'use server'

import { randomUUID } from 'node:crypto'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { paymentProvider } from '@/features/payments/select'
import { contributeSchema, createCampaignSchema } from '../schema'

async function db() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/**
 * Open a campaign. It is created as 'pending_review' — never live — so a human (admin) checks the beneficiary and the
 * cause before any fan can back it. The organizer is stamped by the database default (auth.uid()), and RLS lets a fan
 * create only their own, only in draft/review.
 */
export const createCampaignAction = actionClient.inputSchema(createCampaignSchema).action(async ({ parsedInput: p }) => {
  const supabase = await db()
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      title: p.title,
      description: p.description,
      category: p.category,
      team_id: p.teamId ?? null,
      fixture_id: p.fixtureId ?? null,
      goal_agorot: p.goalAgorot,
      funding_model: p.fundingModel,
      beneficiary_kind: p.beneficiaryKind,
      beneficiary_name: p.beneficiaryName,
      image_path: p.imagePath ?? null,
      deadline: p.deadline,
      status: 'pending_review',
    })
    .select('id')
    .single()
  if (error || !data) return { error: 'פתיחת הקמפיין נכשלה. נסו שוב' }
  return { id: data.id }
})

/**
 * Back a campaign. The money is only *held* (the provider authorises it); it is captured later if the campaign meets
 * its goal, or released if it doesn't. No card data ever reaches us — the hold is placed through the provider and we
 * keep only its opaque reference. (Today the provider is the mock, so nothing real is charged.)
 */
export const contributeAction = actionClient.inputSchema(contributeSchema).action(async ({ parsedInput: p }) => {
  const supabase = await db()

  // The campaign must be live to accept a pledge (RLS also enforces this on insert).
  const { data: campaign } = await supabase.from('campaigns').select('id,status').eq('id', p.campaignId).maybeSingle()
  if (!campaign || campaign.status !== 'live') return { error: 'הקמפיין אינו פעיל' }

  // Place the hold with the provider (no fee split in the mock; the real adapter computes it from configured bps).
  const provider = paymentProvider()
  const auth = await provider.authorize({
    amountAgorot: p.amountAgorot,
    beneficiaryRef: campaign.id,
    feeAgorot: 0,
    campaignId: campaign.id,
    contributionId: randomUUID(),
  })
  if (!auth.ok) return { error: 'התשלום לא אושר. נסו שוב' }

  // Record the pledge as 'held'. Counters (raised, supporters) update by trigger. RLS checks user = me + live.
  const { error } = await supabase.from('campaign_contributions').insert({
    campaign_id: campaign.id,
    amount_agorot: p.amountAgorot,
    status: 'held',
    provider: provider.name,
    provider_ref: auth.ref,
    anonymous: p.anonymous,
  })
  if (error) {
    await provider.release(auth.ref) // don't leave a dangling hold if the record failed
    return { error: 'לא הצלחנו לרשום את התרומה. נסו שוב' }
  }
  return { ok: true }
})
