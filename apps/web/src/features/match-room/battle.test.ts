import { describe, expect, it } from 'vitest'
import { BATTLE_WINDOW_MS, type Beat, battleSplit, leader, pruneBeats, sides } from './battle'

const at = (ms: number): number => ms
const beat = (side: 'h' | 'a', when: number): Beat => ({ side, at: when })

describe('battleSplit', () => {
  it('sits dead centre when there is no activity', () => {
    expect(battleSplit([], at(10_000))).toBe(50)
  })

  it('leans toward the side with more recent beats', () => {
    const now = 100_000
    const beats = [beat('h', now - 1000), beat('h', now - 2000), beat('a', now - 1500)]
    expect(battleSplit(beats, now)).toBeGreaterThan(50)
  })

  it('never pins fully to one end, even in a one-sided burst', () => {
    const now = 100_000
    const beats = Array.from({ length: 50 }, (_, i) => beat('h', now - i * 100))
    const s = battleSplit(beats, now)
    expect(s).toBeLessThanOrEqual(92)
    expect(s).toBeGreaterThan(80)
  })

  it('stays on the leading side until its beats expire, then snaps back to centre', () => {
    const t0 = 0
    const burst = [beat('h', t0), beat('h', t0 + 10), beat('h', t0 + 20)]
    expect(battleSplit(burst, t0 + 1000)).toBeGreaterThan(50) // one-sided → pinned home
    expect(battleSplit(burst, t0 + BATTLE_WINDOW_MS - 1000)).toBeGreaterThan(50) // still, while beats live
    expect(battleSplit(burst, t0 + 20 + BATTLE_WINDOW_MS + 1)).toBe(50) // last beat aged out → centre
  })

  it('recent beats weigh more than older ones when both sides are active', () => {
    const now = 100_000
    const freshHome = [beat('h', now - 500), beat('a', now - BATTLE_WINDOW_MS + 500)]
    expect(battleSplit(freshHome, now)).toBeGreaterThan(50) // home's beat is fresher → stronger pull
  })

  it('ignores beats in the future or past the window', () => {
    const now = 100_000
    expect(sides([beat('h', now + 5000)], now).home).toBe(0)
    expect(sides([beat('h', now - BATTLE_WINDOW_MS - 1)], now).home).toBe(0)
  })
})

describe('pruneBeats', () => {
  it('keeps only beats still inside the window', () => {
    const now = 200_000
    const kept = beat('a', now - 1000)
    const gone = beat('h', now - BATTLE_WINDOW_MS - 1)
    expect(pruneBeats([gone, kept], now)).toEqual([kept])
  })
})

describe('leader', () => {
  it('is null when quiet or even', () => {
    expect(leader([], 0)).toBeNull()
    const now = 10_000
    expect(leader([beat('h', now - 100), beat('a', now - 100)], now)).toBeNull()
  })

  it('names the busier side', () => {
    const now = 10_000
    expect(leader([beat('a', now - 100), beat('a', now - 200)], now)).toBe('a')
  })
})
