import { describe, expect, it } from 'vitest'
import { REPORT_REASONS, reportSchema } from './schema'

describe('report reasons', () => {
  it('include fake items / ticket sales (terms of use, 2026-10-15)', () => {
    const r = reportSchema.safeParse({ kind: 'user', ref: 'x', reason: 'פריט מזויף / מכירת כרטיסים' })
    expect(r.success).toBe(true)
  })
  it('fit the database column (varchar 60)', () => {
    for (const reason of REPORT_REASONS) expect(reason.length).toBeLessThanOrEqual(60)
  })
  it('refuse a reason that is not on the list', () => {
    expect(reportSchema.safeParse({ kind: 'user', ref: 'x', reason: 'סתם' }).success).toBe(false)
  })
})
