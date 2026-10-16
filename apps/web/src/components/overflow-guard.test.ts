import { describe, expect, it } from 'vitest'
import { overflowLabel, overflowPx } from './overflow-guard'

describe('overflow guard', () => {
  it('measures how much wider than the screen the page is', () => {
    expect(overflowPx(482, 375)).toBe(107)
    expect(overflowPx(375, 375)).toBe(0)
    expect(overflowPx(376, 375)).toBe(0) // sub-pixel rounding is not a bug
  })

  it('names the bug in Hebrew with the amount and the culprit', () => {
    expect(overflowLabel(107, 'span.sr-only')).toBe('באג פריסה: הדף רחב מהמסך ב-107 פיקסלים · span.sr-only')
    expect(overflowLabel(12, null)).toBe('באג פריסה: הדף רחב מהמסך ב-12 פיקסלים')
  })
})
