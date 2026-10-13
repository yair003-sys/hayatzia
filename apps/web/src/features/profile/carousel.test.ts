import { describe, expect, it } from 'vitest'
import { clubFrame, settleClub } from './carousel'

describe('club carousel (cover-flow, Hebrew: the next club waits on the left)', () => {
  it('the club in the middle faces you and is picked', () => {
    const f = clubFrame(3, 3)
    expect(f.transform).toBe('translateX(0px) translateZ(0px) rotateY(0deg)')
    expect(f.picked).toBe(true)
    expect(f.opacity).toBe(1)
  })

  it('neighbours step back and turn away, far ones fade out', () => {
    expect(clubFrame(4, 3).transform).toBe('translateX(-120px) translateZ(-120px) rotateY(38deg)')
    expect(clubFrame(2, 3).transform).toBe('translateX(120px) translateZ(-120px) rotateY(-38deg)')
    expect(clubFrame(4, 3).picked).toBe(false)
    expect(clubFrame(9, 3).opacity).toBe(0)
    expect(clubFrame(9, 3).transform).toBe('translateX(-360px) translateZ(-360px) rotateY(114deg)')
    expect(clubFrame(3, 3).z).toBeGreaterThan(clubFrame(4, 3).z)
  })

  it('a flick carries on in its direction; it never runs past the ends', () => {
    expect(settleClub(2.4, 0, 14)).toBe(2)
    expect(settleClub(2.4, 1, 14)).toBe(4)
    expect(settleClub(2.4, -1, 14)).toBe(1)
    expect(settleClub(13.2, 2, 14)).toBe(13)
    expect(settleClub(-0.3, -2, 14)).toBe(0)
  })
})
