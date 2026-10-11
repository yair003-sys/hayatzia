import { describe, expect, it } from 'vitest'
import { roomState } from './schema'

const K = 1_800_000_000 // kick-off, unix seconds
const at = (min: number) => K * 1000 + min * 60_000

describe('roomState', () => {
  it('opens 30 minutes before kick-off', () => {
    expect(roomState(K, at(-31))).toBe('soon')
    expect(roomState(K, at(-30))).toBe('open')
  })
  it('is closing for an hour after the match and closed after 170 minutes', () => {
    expect(roomState(K, at(109))).toBe('open')
    expect(roomState(K, at(110))).toBe('closing')
    expect(roomState(K, at(169))).toBe('closing')
    expect(roomState(K, at(170))).toBe('closed')
  })
})
