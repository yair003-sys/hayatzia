import { describe, expect, it } from 'vitest'
import { FAN_LABELS, fanLabel } from './fan-identity'

describe('fanLabel (algorithm phase 2)', () => {
  it('a brand-new fan has no label yet', () => {
    expect(fanLabel({ games: 0, tactical: 1, uploads: 2 })).toBeNull()
  })

  it('the dominant activity wins once it clears the floor', () => {
    expect(fanLabel({ games: 5, tactical: 1, uploads: 0 })).toBe(FAN_LABELS.diehard)
    expect(fanLabel({ games: 0, tactical: 7, uploads: 2 })).toBe(FAN_LABELS.tactician)
    expect(fanLabel({ games: 1, tactical: 2, uploads: 9 })).toBe(FAN_LABELS.creator)
  })

  it('ties break by priority: die-hard > tactician > creator', () => {
    expect(fanLabel({ games: 4, tactical: 4, uploads: 4 })).toBe(FAN_LABELS.diehard)
    expect(fanLabel({ games: 0, tactical: 4, uploads: 4 })).toBe(FAN_LABELS.tactician)
  })
})
