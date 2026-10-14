import { describe, expect, it } from 'vitest'
import { average, positionGroup, rateSchema } from './schema'

describe('positionGroup', () => {
  it('groups positions in pitch order', () => {
    expect(positionGroup('GK').order).toBe(0)
    expect(positionGroup('LB').label).toBe('הגנה')
    expect(positionGroup('CAM').label).toBe('קישור')
    expect(positionGroup('ST').label).toBe('התקפה')
    expect(positionGroup('מאמן').order).toBe(4)
  })
  it('knows the long codes used in the squad data (DF, MF, FW), not as staff', () => {
    expect(positionGroup('DF').label).toBe('הגנה')
    expect(positionGroup('MF').label).toBe('קישור')
    expect(positionGroup('FW').label).toBe('התקפה')
  })
})

describe('average', () => {
  it('rounds to one decimal and is null without ratings', () => {
    expect(average(13, 3)).toBe(4.3)
    expect(average(0, 0)).toBeNull()
  })
})

describe('rateSchema', () => {
  it('accepts 1–5 stars for a club player id', () => {
    expect(rateSchema.safeParse({ playerId: 'mta_14', stars: 5 }).success).toBe(true)
    expect(rateSchema.safeParse({ playerId: 'mta_14', stars: 0 }).success).toBe(false)
    expect(rateSchema.safeParse({ playerId: "x'; drop", stars: 3 }).success).toBe(false)
  })
})
