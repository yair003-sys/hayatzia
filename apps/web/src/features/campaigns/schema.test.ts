import { describe, expect, it } from 'vitest'
import {
  campaignOutcome,
  contributeSchema,
  createCampaignSchema,
  daysLeft,
  feeAgorot,
  progressPct,
  shekelLabel,
} from './schema'

const DAY = 86_400_000

describe('campaignOutcome', () => {
  const base = { raisedAgorot: 5000, goalAgorot: 10000, deadlineMs: 1000, nowMs: 0 } as const

  it('is open before the deadline', () => {
    expect(campaignOutcome({ ...base, fundingModel: 'all_or_nothing' })).toBe('open')
  })

  it('all-or-nothing: funded only if the goal is met by the deadline', () => {
    const at = { ...base, nowMs: 2000, fundingModel: 'all_or_nothing' as const }
    expect(campaignOutcome({ ...at, raisedAgorot: 10000 })).toBe('funded')
    expect(campaignOutcome({ ...at, raisedAgorot: 9999 })).toBe('failed')
  })

  it('flexible: funded at the deadline regardless of the goal', () => {
    expect(campaignOutcome({ ...base, nowMs: 2000, raisedAgorot: 1, fundingModel: 'flexible' })).toBe('funded')
  })
})

describe('progressPct', () => {
  it('clamps and rounds', () => {
    expect(progressPct(5000, 10000)).toBe(50)
    expect(progressPct(20000, 10000)).toBe(100)
    expect(progressPct(0, 10000)).toBe(0)
    expect(progressPct(100, 0)).toBe(0) // no divide-by-zero
  })
})

describe('feeAgorot', () => {
  it('computes the commission from basis points, rounded', () => {
    expect(feeAgorot(10000, 500)).toBe(500) // 5%
    expect(feeAgorot(333, 500)).toBe(17) // 16.65 → 17
    expect(feeAgorot(10000, 0)).toBe(0)
    expect(feeAgorot(0, 500)).toBe(0)
  })
})

describe('daysLeft / shekelLabel', () => {
  it('counts whole days, never negative', () => {
    expect(daysLeft(3 * DAY, 0)).toBe(3)
    expect(daysLeft(0, 5 * DAY)).toBe(0)
  })
  it('shows agorot as grouped whole shekels', () => {
    expect(shekelLabel(1_240_000)).toBe('₪12,400')
    expect(shekelLabel(3600)).toBe('₪36')
  })
})

describe('schemas', () => {
  const okCreate = {
    title: 'טיפו לדרבי',
    category: 'tifo',
    goalAgorot: 2_000_000,
    beneficiaryKind: 'amuta',
    beneficiaryName: 'עמותת אוהדים',
    deadline: '2026-12-01T00:00:00.000Z',
  }
  it('accepts a valid campaign and defaults funding to all-or-nothing', () => {
    const r = createCampaignSchema.parse(okCreate)
    expect(r.fundingModel).toBe('all_or_nothing')
    expect(r.description).toBe('')
  })
  it('rejects a goal below the minimum and a bad category', () => {
    expect(createCampaignSchema.safeParse({ ...okCreate, goalAgorot: 1 }).success).toBe(false)
    expect(createCampaignSchema.safeParse({ ...okCreate, category: 'nope' }).success).toBe(false)
  })
  it('contribute requires a uuid and a valid amount', () => {
    expect(contributeSchema.safeParse({ campaignId: 'x', amountAgorot: 3600 }).success).toBe(false)
    const ok = contributeSchema.parse({ campaignId: '00000000-0000-0000-0000-0000000000aa', amountAgorot: 3600 })
    expect(ok.anonymous).toBe(false)
  })
})
