import { describe, expect, it } from 'vitest'
import { orderedPair } from './schema'

describe('orderedPair', () => {
  it('always puts the smaller id first', () => {
    const a = '00000000-0000-0000-0000-000000000001'
    const b = '00000000-0000-0000-0000-000000000002'
    expect(orderedPair(b, a)).toEqual({ user_a: a, user_b: b })
    expect(orderedPair(a, b)).toEqual({ user_a: a, user_b: b })
  })
})
