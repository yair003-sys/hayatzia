import { describe, expect, it } from 'vitest'
import { INTRO_PAGES, dragPosition, pillRight, slideFrame, snapTarget } from './schema'

describe('first-run intro', () => {
  it('has five pages, each with a kicker, a title and one short line', () => {
    expect(INTRO_PAGES).toHaveLength(5)
    for (const p of INTRO_PAGES) {
      expect(p.kicker.length).toBeGreaterThan(0)
      expect(p.title.length).toBeLessThanOrEqual(24)
      expect(p.body.length).toBeLessThanOrEqual(90)
    }
  })

  it('the page in front is flat, the next one waits on the left turned away (Hebrew reads right to left)', () => {
    const front = slideFrame(2, 2, 360)
    expect(front.transform).toBe('translateX(0px) rotateY(0deg)')
    expect(front.opacity).toBe(1)
    expect(front.visible).toBe(true)
    const next = slideFrame(3, 2, 360)
    expect(next.transform).toBe('translateX(-360px) rotateY(75deg)')
    expect(next.origin).toBe('right center')
    const prev = slideFrame(1, 2, 360)
    expect(prev.transform).toBe('translateX(360px) rotateY(-75deg)')
    expect(prev.origin).toBe('left center')
    expect(slideFrame(4, 2, 360).visible).toBe(false)
  })

  it('half way through a turn both pages show, the front one dimmer', () => {
    const leaving = slideFrame(0, 0.5, 400)
    const coming = slideFrame(1, 0.5, 400)
    expect(leaving.transform).toBe('translateX(200px) rotateY(-37.5deg)')
    expect(coming.transform).toBe('translateX(-200px) rotateY(37.5deg)')
    expect(leaving.brightness).toBeCloseTo(0.775)
  })

  it('the green pill travels over the dots, one dot per page', () => {
    expect(pillRight(0)).toBe(-8)
    expect(pillRight(1)).toBe(10)
    expect(pillRight(2.5)).toBe(37)
  })

  it('dragging right moves forward and resists past the ends', () => {
    expect(dragPosition(1, 180, 360, 5)).toBeCloseTo(1.5)
    expect(dragPosition(0, -360, 360, 5)).toBeCloseTo(-0.3)
    expect(dragPosition(4, 360, 360, 5)).toBeCloseTo(4.3)
  })

  it('lets go on the nearest page, or the next one on a quick flick', () => {
    expect(snapTarget(1.4, 1, 0, 5)).toBe(1)
    expect(snapTarget(1.6, 1, 0, 5)).toBe(2)
    expect(snapTarget(1.2, 1, 0.8, 5)).toBe(2)
    expect(snapTarget(0.8, 1, -0.8, 5)).toBe(0)
    expect(snapTarget(4.2, 4, 0.9, 5)).toBe(4)
    expect(snapTarget(-0.2, 0, -0.9, 5)).toBe(0)
  })
})
