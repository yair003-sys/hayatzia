import { describe, expect, it } from 'vitest'
import { isHotMessage, HOT_REACTIONS } from './highlight'

describe('isHotMessage (algorithm phase 6, emoji reactions)', () => {
  it('a quiet message is not hot', () => {
    expect(isHotMessage({ reactions: { '❤️': 2 } })).toBe(false)
    expect(isHotMessage({ reactions: {} })).toBe(false)
    expect(isHotMessage({})).toBe(false)
  })

  it('enough reactions (any emoji) make a message hot', () => {
    expect(isHotMessage({ reactions: { '❤️': HOT_REACTIONS } })).toBe(true)
    expect(isHotMessage({ reactions: { '❤️': 6 } })).toBe(true)
  })

  it('reactions of different emoji add up', () => {
    expect(isHotMessage({ reactions: { '❤️': 3, '🔥': 2 } })).toBe(true)
    expect(isHotMessage({ reactions: { '❤️': 2, '🔥': 2, '👏': 1 } })).toBe(true)
    expect(isHotMessage({ reactions: { '❤️': 2, '🔥': 2 } })).toBe(false)
  })
})
