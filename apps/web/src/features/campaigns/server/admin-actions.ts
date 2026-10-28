'use server'

import { actionClient } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { paymentProvider } from '@/features/payments/select'
import { approveVendorSchema, campaignOutcome, feeAgorot, releaseToVendorSchema, settleCampaignSchema } from '../schema'

async function admin() {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' as const }
  const { data: isAdmin } = await supabase.rpc('is_app_admin')
  if (!isAdmin) return { error: 'אין הרשאה' as const }
  const service = createAdminClient()
  if (!service) return { error: 'השירות אינו מוגדר' as const }
  return { supabase, service }
}

/**
 * Close a campaign at its deadline. Goal met → capture every held pledge and move to 'awaiting_invoice' (ready to pay
 * the vendor); goal missed → release every hold and mark 'failed'. Admin-only; money moves through the provider
 * (today the mock), contribution/campaign writes through the service role.
 */
export const settleCampaignAction = actionClient.inputSchema(settleCampaignSchema).action(async ({ parsedInput: { campaignId } }) => {
  const a = await admin()
  if ('error' in a) return a
  const { service } = a
  const { data: c } = await service
    .from('campaigns')
    .select('id,status,goal_agorot,raised_agorot,deadline,funding_model')
    .eq('id', campaignId)
    .maybeSingle()
  if (!c) return { error: 'הקמפיין לא נמצא' }
  if (c.status !== 'live') return { error: 'אפשר לסגור רק קמפיין פעיל' }

  const outcome = campaignOutcome({
    raisedAgorot: c.raised_agorot,
    goalAgorot: c.goal_agorot,
    fundingModel: c.funding_model as 'all_or_nothing' | 'flexible',
    deadlineMs: new Date(c.deadline).getTime(),
    nowMs: Date.now(),
  })
  if (outcome === 'open') return { error: 'הקמפיין עדיין פעיל — טרם הסתיים' }

  const provider = paymentProvider()
  const { data: held } = await service.from('campaign_contributions').select('id,provider_ref').eq('campaign_id', campaignId).eq('status', 'held')
  for (const h of held ?? []) {
    if (h.provider_ref) await (outcome === 'funded' ? provider.capture(h.provider_ref) : provider.release(h.provider_ref))
  }
  const next = outcome === 'funded' ? 'captured' : 'released'
  await service.from('campaign_contributions').update({ status: next }).eq('campaign_id', campaignId).eq('status', 'held')
  await service.from('campaigns').update({ status: outcome === 'funded' ? 'awaiting_invoice' : 'failed' }).eq('id', campaignId)
  return { ok: true as const, outcome }
})

/**
 * Release the funds straight to the vendor against a verified tax invoice, keeping onefan's fee. Campaign must be
 * 'awaiting_invoice' with an approved vendor. Records the payout line and moves the campaign to 'paid_out'.
 */
export const releaseToVendorAction = actionClient.inputSchema(releaseToVendorSchema).action(async ({ parsedInput: p }) => {
  const a = await admin()
  if ('error' in a) return a
  const { service } = a
  const { data: c } = await service.from('campaigns').select('id,status,raised_agorot,vendor_id').eq('id', p.campaignId).maybeSingle()
  if (!c) return { error: 'הקמפיין לא נמצא' }
  if (c.status !== 'awaiting_invoice') return { error: 'הקמפיין לא ממתין לחשבונית' }
  if (!c.vendor_id) return { error: 'לא הוגדר ספק לקמפיין' }
  const { data: v } = await service.from('campaign_vendors').select('id,payout_ref,status').eq('id', c.vendor_id).maybeSingle()
  if (!v || v.status !== 'approved') return { error: 'הספק אינו מאומת' }

  const fee = feeAgorot(c.raised_agorot, env.CAMPAIGN_FEE_BPS ?? 0)
  const amount = c.raised_agorot - fee
  const r = await paymentProvider().payoutToVendor({ vendorRef: v.payout_ref ?? v.id, amountAgorot: amount, feeAgorot: fee, campaignId: c.id })
  if (!r.ok) return { error: 'השחרור לספק נכשל' }

  await service.from('campaign_payouts').insert({
    campaign_id: c.id,
    vendor_id: v.id,
    amount_agorot: amount,
    fee_agorot: fee,
    invoice_number: p.invoiceNumber,
    invoice_date: p.invoiceDate,
    invoice_amount_agorot: p.invoiceAmountAgorot,
    status: 'released',
    released_at: new Date().toISOString(),
  })
  await service.from('campaigns').update({ status: 'paid_out' }).eq('id', c.id)
  return { ok: true as const }
})

/** Approve a proposed vendor so campaigns may send money its way. Admin-only (the RLS update policy enforces it too). */
export const approveVendorAction = actionClient.inputSchema(approveVendorSchema).action(async ({ parsedInput: { vendorId } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data: isAdmin } = await supabase.rpc('is_app_admin')
  if (!isAdmin) return { error: 'אין הרשאה' }
  const { error } = await supabase.from('campaign_vendors').update({ status: 'approved' }).eq('id', vendorId)
  if (error) return { error: 'האישור נכשל' }
  return { ok: true as const }
})
