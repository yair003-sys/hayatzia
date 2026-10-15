import { describe, expect, it } from 'vitest'
import { moderationHe } from './moderation'

describe('moderationHe', () => {
  it('turns the database refusals into Hebrew, and nothing else', () => {
    expect(moderationHe('offensive_content')).toBe('לא נשלח: יש בטקסט גזענות, הסתה או איום')
    expect(moderationHe('new row violates: offensive_name')).toBe('השם מכיל מילה לא ראויה. נסה שם אחר')
    expect(moderationHe('rate_limit')).toBeNull()
    expect(moderationHe(undefined)).toBeNull()
  })
})
