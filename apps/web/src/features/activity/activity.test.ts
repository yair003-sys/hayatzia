import { describe, expect, it } from 'vitest'
import {
  activityHref,
  activityLine,
  badgeLabel,
  bellLabel,
  decodeCursor,
  encodeCursor,
  isUnseen,
  mergeItems,
  parseActivityEvent,
  relativeTime,
  tripAcceptedLine,
  tripHref,
  tripRequestLine,
} from './activity'

const TRIP = '33333333-3333-4333-8333-333333333333'

describe('activityLine', () => {
  it('one like on a clip or a photo: singular', () => {
    expect(activityLine({ kind: 'clip_like', nick: 'דני', count: 1 })).toBe('דני אהב את הסרטון שלך')
    expect(activityLine({ kind: 'photo_like', nick: 'דני', count: 1 })).toBe('דני אהב את התמונה שלך')
  })

  it('more likes: "<nick> ועוד N אהבו", N = the others', () => {
    expect(activityLine({ kind: 'clip_like', nick: 'דני', count: 13 })).toBe('דני ועוד 12 אהבו את הסרטון שלך')
    expect(activityLine({ kind: 'photo_like', nick: 'דני', count: 2 })).toBe('דני ועוד 1 אהבו את התמונה שלך')
  })

  it('trip request and acceptance', () => {
    expect(activityLine({ kind: 'trip_request', nick: 'יוסי', count: 1 })).toBe('יוסי ביקש להצטרף לנסיעה שלך')
    expect(activityLine({ kind: 'trip_accepted', nick: 'דני', count: 1 })).toBe('אושרת! הצטרפת לנסיעה של דני')
    expect(tripRequestLine('יוסי')).toBe('יוסי ביקש להצטרף לנסיעה שלך')
    expect(tripAcceptedLine('דני')).toBe('אושרת! הצטרפת לנסיעה של דני')
  })

  it('unknown or deleted fan (null / blank nick) → "אוהד"', () => {
    expect(activityLine({ kind: 'clip_like', nick: null, count: 1 })).toBe('אוהד אהב את הסרטון שלך')
    expect(activityLine({ kind: 'clip_like', nick: '  ', count: 3 })).toBe('אוהד ועוד 2 אהבו את הסרטון שלך')
    expect(tripRequestLine(undefined)).toBe('אוהד ביקש להצטרף לנסיעה שלך')
    expect(tripAcceptedLine(null)).toBe('אושרת! הצטרפת לנסיעה של אוהד')
  })

  it('a count below 1 is treated as one', () => {
    expect(activityLine({ kind: 'clip_like', nick: 'דני', count: 0 })).toBe('דני אהב את הסרטון שלך')
  })
})

describe('badge', () => {
  it('0 or less → hidden', () => {
    expect(badgeLabel(0)).toBeNull()
    expect(badgeLabel(-1)).toBeNull()
  })

  it('1..99 as is; 100 (the database cap) → "99+"', () => {
    expect(badgeLabel(1)).toBe('1')
    expect(badgeLabel(99)).toBe('99')
    expect(badgeLabel(100)).toBe('99+')
    expect(badgeLabel(250)).toBe('99+')
  })

  it('accessible label', () => {
    expect(bellLabel(0)).toBe('התראות')
    expect(bellLabel(5)).toBe('התראות, 5 חדשות')
    expect(bellLabel(100)).toBe('התראות, 99+ חדשות')
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-10-14T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('under a minute (or a clock a little ahead) → "עכשיו"', () => {
    expect(relativeTime(ago(10_000), now)).toBe('עכשיו')
    expect(relativeTime(ago(-30_000), now)).toBe('עכשיו')
  })

  it('minutes, hours, yesterday, days', () => {
    expect(relativeTime(ago(5 * 60_000), now)).toBe('לפני 5 דק׳')
    expect(relativeTime(ago(59 * 60_000), now)).toBe('לפני 59 דק׳')
    expect(relativeTime(ago(3 * 3600_000), now)).toBe('לפני 3 שע׳')
    expect(relativeTime(ago(30 * 3600_000), now)).toBe('אתמול')
    expect(relativeTime(ago(5 * 86400_000), now)).toBe('לפני 5 ימים')
  })

  it('an unreadable time → empty', () => {
    expect(relativeTime('nope', now)).toBe('')
  })
})

describe('keyset cursor', () => {
  it('round-trips (microseconds and offset kept)', () => {
    const c = { updatedAt: '2026-10-14T10:00:00.123456+00:00', id: 42 }
    const s = encodeCursor(c)
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/) // URL-safe
    expect(decodeCursor(s)).toEqual(c)
  })

  it('rejects anything else', () => {
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor('')).toBeNull()
    expect(decodeCursor('%%%')).toBeNull()
    expect(decodeCursor(encodeCursor({ updatedAt: 'x),id.gt.0', id: 1 }))).toBeNull()
    expect(decodeCursor(encodeCursor({ updatedAt: '2026-10-14T10:00:00Z', id: -1 }))).toBeNull()
    expect(decodeCursor(btoa('2026-10-14T10:00:00Z|1.5'))).toBeNull()
  })
})

describe('isUnseen', () => {
  it('never seen → every row is new', () => {
    expect(isUnseen('2026-10-14T10:00:00Z', null)).toBe(true)
  })
  it('newer than the last visit only', () => {
    expect(isUnseen('2026-10-14T10:00:01Z', '2026-10-14T10:00:00+00:00')).toBe(true)
    expect(isUnseen('2026-10-14T09:59:59Z', '2026-10-14T10:00:00+00:00')).toBe(false)
  })
})

describe('links', () => {
  it('trip → the trips board focused on it', () => {
    expect(tripHref(TRIP)).toBe(`/stand/trips?trip=${TRIP}`)
    expect(activityHref({ kind: 'trip_request', tripId: TRIP, clipAudience: null })).toBe(`/stand/trips?trip=${TRIP}`)
    expect(activityHref({ kind: 'trip_accepted', tripId: TRIP, clipAudience: null })).toBe(`/stand/trips?trip=${TRIP}`)
  })
  it('clip → its Square tab; photo → the club tab', () => {
    expect(activityHref({ kind: 'clip_like', tripId: null, clipAudience: 'all' })).toBe('/square')
    expect(activityHref({ kind: 'clip_like', tripId: null, clipAudience: 'team' })).toBe('/square?f=team')
    expect(activityHref({ kind: 'clip_like', tripId: null, clipAudience: null })).toBe('/square')
    expect(activityHref({ kind: 'photo_like', tripId: null, clipAudience: null })).toBe('/square?f=team')
  })
})

describe('parseActivityEvent', () => {
  it('the `activity` broadcast: kind only (Realtime may add its own id)', () => {
    expect(parseActivityEvent('activity', { kind: 'clip_like' })).toBe('clip_like')
    expect(parseActivityEvent('activity', { kind: 'trip_request', id: 'x' })).toBe('trip_request')
  })
  it('anything else → null', () => {
    expect(parseActivityEvent('message', { kind: 'clip_like' })).toBeNull()
    expect(parseActivityEvent('activity', { kind: 'comment' })).toBeNull()
    expect(parseActivityEvent('activity', null)).toBeNull()
  })
})

describe('mergeItems (live refresh over loaded pages)', () => {
  const at = (min: number) => new Date(Date.UTC(2026, 9, 14, 10, min)).toISOString()
  const row = (id: number, min: number) => ({ id, updatedAt: at(min) })

  it('keeps older pages already loaded; a changed row moves up, a removed one goes', () => {
    const held = [row(5, 50), row(4, 40), row(3, 30), row(2, 20), row(1, 10)]
    // New like on #2 (moved to the top), #4 removed (unliked); the first page now ends at #3.
    const fresh = [row(2, 60), row(5, 50), row(3, 30)]
    expect(mergeItems(fresh, held, false).map((r) => r.id)).toEqual([2, 5, 3, 1])
  })

  it('the whole list in the first page → exactly it', () => {
    expect(mergeItems([row(9, 90)], [row(9, 80), row(1, 10)], true).map((r) => r.id)).toEqual([9])
  })

  it('ties on time are ordered by id, newest first', () => {
    expect(mergeItems([row(7, 50)], [row(6, 50), row(8, 50)], false).map((r) => r.id)).toEqual([7, 6])
  })
})
