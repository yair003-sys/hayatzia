import { describe, expect, it } from 'vitest'
import { isHotMessage } from './highlight'

describe('isHotMessage (algorithm phase 6)', () => {
  it('a quiet message is not hot', () => {
    expect(isHotMessage({ likes: 2, dislikes: 0 })).toBe(false)
    expect(isHotMessage({ likes: 0, dislikes: 0 })).toBe(false)
    expect(isHotMessage({})).toBe(false)
  })

  it('a well-liked, clearly net-positive message is hot', () => {
    expect(isHotMessage({ likes: 6, dislikes: 1 })).toBe(true)
    expect(isHotMessage({ likes: 5, dislikes: 2 })).toBe(true)
  })

  it('a divisive (flamed) message is not highlighted even with many likes', () => {
    expect(isHotMessage({ likes: 8, dislikes: 7 })).toBe(false)
  })
})
