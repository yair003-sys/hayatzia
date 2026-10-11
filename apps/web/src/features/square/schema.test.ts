import { describe, expect, it } from 'vitest'
import { createClipSchema, mediaOf, shortCount, timeLeftHe } from './schema'

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
