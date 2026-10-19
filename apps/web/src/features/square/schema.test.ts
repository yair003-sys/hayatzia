import { describe, expect, it } from 'vitest'
import { createClipSchema, feedCursorSchema, fitWithin, mediaOf, shortCount, shouldShrink, timeLeftHe } from './schema'

describe('mediaOf', () => {
  it('accepts photos and videos the bucket allows', () => {
    expect(mediaOf('image/jpeg')).toEqual({ kind: 'image', ext: 'jpg' })
    expect(mediaOf('video/quicktime')).toEqual({ kind: 'video', ext: 'mov' })
    expect(mediaOf('application/pdf')).toBeNull()
  })
})

describe('timeLeftHe', () => {
  const now = Date.parse('2026-10-11T20:00:00Z')
  it('counts down in hours, then minutes', () => {
    expect(timeLeftHe('2026-10-12T19:30:00Z', now)).toBe('עוד 23 שע׳')
    expect(timeLeftHe('2026-10-11T20:12:30Z', now)).toBe('עוד 12 דק׳')
    expect(timeLeftHe('2026-10-11T19:59:00Z', now)).toBe('נעלם')
  })
})

describe('shortCount', () => {
  it('shortens big numbers', () => {
    expect(shortCount(999)).toBe('999')
    expect(shortCount(1200)).toBe('1.2K')
    expect(shortCount(1000)).toBe('1K')
    expect(shortCount(25_400)).toBe('25K')
  })
})

describe('createClipSchema', () => {
  const uid = '00000000-0000-0000-0000-0000000000f1'
  const file = '11111111-2222-3333-4444-555555555555'
  it('only accepts a path in the fan folder with a known extension', () => {
    expect(createClipSchema.safeParse({ path: `${uid}/${file}.jpg`, kind: 'image' }).success).toBe(true)
    expect(createClipSchema.safeParse({ path: `../${file}.jpg`, kind: 'image' }).success).toBe(false)
    expect(createClipSchema.safeParse({ path: `${uid}/${file}.exe`, kind: 'image' }).success).toBe(false)
  })
})

describe('audience', () => {
  const uid = '00000000-0000-0000-0000-0000000000f1'
  const file = '11111111-2222-3333-4444-555555555555'
  it('posts to the whole league unless the club tab is open', () => {
    expect(createClipSchema.parse({ path: `${uid}/${file}.jpg`, kind: 'image' }).audience).toBe('all')
    expect(createClipSchema.parse({ path: `${uid}/${file}.jpg`, kind: 'image', audience: 'team' }).audience).toBe('team')
    expect(createClipSchema.safeParse({ path: `${uid}/${file}.jpg`, kind: 'image', audience: 'friends' }).success).toBe(false)
  })
  it('pages the tab that is open (offset pagination)', () => {
    expect(feedCursorSchema.parse({ offset: 20 }).audience).toBe('all')
    expect(feedCursorSchema.parse({ offset: 40, audience: 'team' }).audience).toBe('team')
    expect(feedCursorSchema.safeParse({ offset: -1 }).success).toBe(false)
  })
})

describe('shrinking photos before upload', () => {
  it('fits the long side into 1600px and keeps the shape', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
  it('shrinks still photos only (videos and animated GIFs are sent as they are)', () => {
    expect(shouldShrink('image/jpeg')).toBe(true)
    expect(shouldShrink('image/png')).toBe(true)
    expect(shouldShrink('image/gif')).toBe(false)
    expect(shouldShrink('video/mp4')).toBe(false)
  })
})
