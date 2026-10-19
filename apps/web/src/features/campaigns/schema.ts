import { z } from 'zod'

// Pure campaign logic and input shapes. No database, no money movement — safe on the server and in tests. Money is
// in agorot (integers). The commission RATE is never hard-coded here: fee() takes basis points supplied at the call
// site (from config the owner sets), so this public repo carries no business number.

export const CATEGORIES = ['tifo', 'banner', 'gift', 'youth', 'charity', 'community', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_HE: Record<Category, string> = {
  tifo: 'תצוגת קהל',
  banner: 'שלט / באנר',
  gift: 'מתנה לשחקן',
  youth: 'קבוצת נוער',
  charity: 'צדקה',
  community: 'קהילה',
  other: 'אחר',
}

export const STATUSES = ['draft', 'pending_review', 'live', 'funded', 'failed', 'paid_out', 'cancelled'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_HE: Record<Status, string> = {
  draft: 'טיוטה',
  pending_review: 'בבדיקה',
  live: 'פעיל',
  funded: 'הגיע ליעד',
  failed: 'לא הגיע ליעד',
  paid_out: 'שולם למוטב',
  cancelled: 'בוטל',
}

export const BENEFICIARY_KINDS = ['individual', 'business', 'amuta'] as const
export type BeneficiaryKind = (typeof BENEFICIARY_KINDS)[number]

export const FUNDING_MODELS = ['all_or_nothing', 'flexible'] as const
export type FundingModel = (typeof FUNDING_MODELS)[number]

// Money bounds mirror the database checks: ₪1 .. ₪1,000,000, in agorot.
export const MIN_AGOROT = 100
export const MAX_AGOROT = 100_000_000

export type Outcome = 'open' | 'funded' | 'failed'

/**
 * Where a campaign stands at a moment. All-or-nothing (Kickstarter): the backers are only charged if the goal is met
 * by the deadline, otherwise every hold is released — so it stays `open` until the deadline, then `funded`/`failed`.
 * Flexible: every pledge is honoured at the deadline regardless of the goal, so it ends `funded` (never `failed`).
 */
export function campaignOutcome(input: {
  raisedAgorot: number
  goalAgorot: number
  fundingModel: FundingModel
  deadlineMs: number
  nowMs: number
}): Outcome {
  if (input.nowMs < input.deadlineMs) return 'open'
  if (input.fundingModel === 'flexible') return 'funded'
  return input.raisedAgorot >= input.goalAgorot ? 'funded' : 'failed'
}

/** Progress toward the goal, 0–100 (clamped). 0 when the goal is non-positive, so the bar never divides by zero. */
export function progressPct(raisedAgorot: number, goalAgorot: number): number {
  if (goalAgorot <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((raisedAgorot / goalAgorot) * 100)))
}

/** onefan's commission for a charge, in agorot, at a rate given in basis points (1% = 100 bps). Rounded, never negative. */
export function feeAgorot(amountAgorot: number, feeBps: number): number {
  if (amountAgorot <= 0 || feeBps <= 0) return 0
  return Math.round((amountAgorot * feeBps) / 10_000)
}

/** Whole days left until the deadline (0 once passed), for the "נותרו N ימים" line. */
export function daysLeft(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 86_400_000))
}

/** "₪12,400" — agorot shown as whole shekels (campaigns deal in round shekels), grouped for he-IL. */
export function shekelLabel(agorot: number): string {
  return `₪${Math.round(agorot / 100).toLocaleString('he-IL')}`
}

const title = z.string().trim().min(3, 'כותרת קצרה מדי').max(90, 'כותרת ארוכה מדי')
const description = z.string().trim().max(4000, 'התיאור ארוך מדי').default('')
const amount = z.number().int('סכום לא תקין').min(MIN_AGOROT, 'הסכום נמוך מדי').max(MAX_AGOROT, 'הסכום גבוה מדי')

/** Opening a campaign. It starts as a draft/in-review — never live (an admin/review publishes it). */
export const createCampaignSchema = z.object({
  title,
  description,
  category: z.enum(CATEGORIES),
  teamId: z.string().min(1).max(40).optional(),
  fixtureId: z.number().int().positive().optional(),
  goalAgorot: amount,
  fundingModel: z.enum(FUNDING_MODELS).default('all_or_nothing'),
  beneficiaryKind: z.enum(BENEFICIARY_KINDS),
  beneficiaryName: z.string().trim().min(2, 'שם המוטב קצר מדי').max(120, 'שם המוטב ארוך מדי'),
  imagePath: z.string().min(1).max(300).optional(),
  deadline: z.iso.datetime({ message: 'תאריך סיום לא תקין' }),
})
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>

/** Backing a campaign: an amount and whether to stay anonymous in the public backers list. */
export const contributeSchema = z.object({
  campaignId: z.uuid(),
  amountAgorot: amount,
  anonymous: z.boolean().default(false),
})
export type ContributeInput = z.infer<typeof contributeSchema>
