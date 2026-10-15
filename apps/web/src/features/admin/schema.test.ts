import { describe, expect, it } from 'vitest'
import { REPORT_KINDS } from '@/features/safety/schema'
import {
  KIND_LABEL,
  adminErrorHe,
  banSchema,
  banUntilLabel,
  fileToRemove,
  isRemovable,
  kindLabel,
  queueStatus,
  removeSchema,
  reportsOnTarget,
  reportTime,
} from './schema'

describe('kind labels', () => {
  it('name every report kind in Hebrew, contact included', () => {
    for (const k of [...REPORT_KINDS, 'contact'] as const) expect(KIND_LABEL[k]).toMatch(/[א-ת]/)
    expect(kindLabel('market_item')).toBe('מודעה בשוק')
    expect(kindLabel('contact')).toBe('פנייה (צור קשר)')
  })
  it('show an unknown kind as is, never crash', () => {
    expect(kindLabel('something_new')).toBe('something_new')
  })
})

describe('what can be removed', () => {
  it('content rows only: a fan is suspended, a private conversation is never opened, a request has no target', () => {
    expect(isRemovable('clip')).toBe(true)
    expect(isRemovable('market_item')).toBe(true)
    expect(isRemovable('user')).toBe(false)
    expect(isRemovable('dm_thread')).toBe(false)
    expect(isRemovable('contact')).toBe(false)
    expect(removeSchema.safeParse({ kind: 'dm_thread', ref: 'x' }).success).toBe(false)
  })
})

describe('fileToRemove', () => {
  it('accepts a path in a known bucket', () => {
    expect(fileToRemove('clips', 'u1/a.mp4')).toEqual({ bucket: 'clips', path: 'u1/a.mp4' })
    expect(fileToRemove('chants', 'u1/s.mp3')).toEqual({ bucket: 'chants', path: 'u1/s.mp3' })
  })
  it('refuses nothing, an unknown bucket or a path that climbs out', () => {
    expect(fileToRemove(null, 'u1/a.mp4')).toBeNull()
    expect(fileToRemove('clips', null)).toBeNull()
    expect(fileToRemove('avatars', 'u1/a.jpg')).toBeNull()
    expect(fileToRemove('clips', '../market/x.jpg')).toBeNull()
    expect(fileToRemove('clips', '/u1/a.jpg')).toBeNull()
  })
})

describe('adminErrorHe', () => {
  it('says what happened', () => {
    expect(adminErrorHe('not_admin')).toBe('אין לך הרשאה לפעולה הזאת')
    expect(adminErrorHe('cannot_ban_admin')).toBe('אי אפשר להשעות מנהל')
    expect(adminErrorHe('bad_kind')).toBe('את התוכן הזה אי אפשר להסיר מכאן')
    expect(adminErrorHe(undefined)).toBe('הפעולה נכשלה. נסה שוב')
  })
})

describe('labels', () => {
  it('count reports on one target', () => {
    expect(reportsOnTarget(1)).toBe('דיווח אחד על התוכן הזה')
    expect(reportsOnTarget(3)).toBe('3 דיווחים על התוכן הזה')
  })
  it('read the tab from the address, open by default', () => {
    expect(queueStatus('handled')).toBe('handled')
    expect(queueStatus('dismissed')).toBe('dismissed')
    expect(queueStatus('nope')).toBe('open')
    expect(queueStatus(undefined)).toBe('open')
    expect(queueStatus(['handled'])).toBe('open')
  })
  it('show times in Israel', () => {
    // 21:30 UTC is 00:30 the next day in Israel (summer time, UTC+3).
    expect(reportTime('2026-07-01T21:30:00Z')).toMatch(/2\.7/)
    expect(reportTime('2026-07-01T21:30:00Z')).toMatch(/00:30/)
  })
  it('a suspension for good has no date', () => {
    expect(banUntilLabel(null)).toBe('לצמיתות')
    expect(banUntilLabel('2026-07-01T09:00:00Z')).toMatch(/^עד /)
  })
})

describe('banSchema', () => {
  it('takes 7 days or for good, nothing else', () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    expect(banSchema.safeParse({ userId, days: 7 }).success).toBe(true)
    expect(banSchema.safeParse({ userId, days: null }).success).toBe(true)
    expect(banSchema.safeParse({ userId, days: 9999 }).success).toBe(false)
    expect(banSchema.safeParse({ userId: 'x', days: 7 }).success).toBe(false)
  })
})
