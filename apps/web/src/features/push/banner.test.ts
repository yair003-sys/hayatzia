import { describe, expect, it } from 'vitest'
import {
  arrivalGate,
  bannerHref,
  inviteLine,
  messageLine,
  parseAlertPayload,
  parseInboxEvent,
  shouldShow,
  tripRowGate,
  type BannerContext,
} from './banner'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const THREAD = '33333333-3333-4333-8333-333333333333'
const GROUP = '44444444-4444-4444-8444-444444444444'

const ctx = (over: Partial<BannerContext> = {}): BannerContext => ({
  pathname: '/stand',
  prefs: { matches: 'all', messages: true },
  myClubApiIds: [604],
  meId: ME,
  ...over,
})

const match = { kind: 'match', fixtureId: 77, homeApiId: 604, awayApiId: 657 } as const
const dm = { kind: 'dm', threadId: THREAD, from: OTHER } as const
const group = { kind: 'group', groupId: GROUP, from: OTHER } as const
const invite = { kind: 'invite', groupId: GROUP } as const

describe('shouldShow: matches', () => {
  it("'all' and missing prefs → shown", () => {
    expect(shouldShow(match, ctx())).toBe(true)
    expect(shouldShow(match, ctx({ prefs: null }))).toBe(true)
    expect(shouldShow(match, ctx({ prefs: undefined }))).toBe(true)
  })

  it("'off' → no match banner", () => {
    expect(shouldShow(match, ctx({ prefs: { matches: 'off', messages: true } }))).toBe(false)
  })

  it("'team' → only when my club plays (home or away)", () => {
    const team = { matches: 'team', messages: true } as const
    expect(shouldShow(match, ctx({ prefs: team, myClubApiIds: [604] }))).toBe(true)
    expect(shouldShow(match, ctx({ prefs: team, myClubApiIds: [657] }))).toBe(true)
    expect(shouldShow(match, ctx({ prefs: team, myClubApiIds: [1, 2] }))).toBe(false)
    expect(shouldShow(match, ctx({ prefs: team, myClubApiIds: [] }))).toBe(false)
  })

  it('not shown on the open match page (trailing slash, ?tab= query and #hash ignored)', () => {
    expect(shouldShow(match, ctx({ pathname: '/matches/77' }))).toBe(false)
    expect(shouldShow(match, ctx({ pathname: '/matches/77/' }))).toBe(false)
    expect(shouldShow(match, ctx({ pathname: '/matches/77?tab=events' }))).toBe(false)
    expect(shouldShow(match, ctx({ pathname: '/matches/77#lineups' }))).toBe(false)
  })

  it('shown on another match page or the match list', () => {
    expect(shouldShow(match, ctx({ pathname: '/matches/78' }))).toBe(true)
    expect(shouldShow(match, ctx({ pathname: '/matches/770' }))).toBe(true)
    expect(shouldShow(match, ctx({ pathname: '/matches' }))).toBe(true)
  })

  it('the messages setting does not affect match banners', () => {
    expect(shouldShow(match, ctx({ prefs: { matches: 'all', messages: false } }))).toBe(true)
  })
})

describe('shouldShow: messages', () => {
  it('shown by default, also with missing prefs', () => {
    expect(shouldShow(dm, ctx())).toBe(true)
    expect(shouldShow(group, ctx({ prefs: null }))).toBe(true)
    expect(shouldShow(invite, ctx())).toBe(true)
  })

  it('messages off → no message, group or invite banner', () => {
    const off = { matches: 'all', messages: false } as const
    expect(shouldShow(dm, ctx({ prefs: off }))).toBe(false)
    expect(shouldShow(group, ctx({ prefs: off }))).toBe(false)
    expect(shouldShow(invite, ctx({ prefs: off }))).toBe(false)
  })

  it('the match setting does not affect message banners', () => {
    expect(shouldShow(dm, ctx({ prefs: { matches: 'off', messages: true } }))).toBe(true)
  })

  it('my own messages are not shown (sent from another device of mine)', () => {
    expect(shouldShow({ ...dm, from: ME }, ctx())).toBe(false)
    expect(shouldShow({ ...group, from: ME }, ctx())).toBe(false)
  })

  it('not shown while that conversation is open', () => {
    expect(shouldShow(dm, ctx({ pathname: `/inbox/${THREAD}` }))).toBe(false)
    expect(shouldShow(dm, ctx({ pathname: `/inbox/${THREAD}/` }))).toBe(false)
    expect(shouldShow(group, ctx({ pathname: `/inbox/g/${GROUP}` }))).toBe(false)
    expect(shouldShow(group, ctx({ pathname: `/inbox/g/${GROUP}?x=1` }))).toBe(false)
  })

  it('shown while another conversation, the inbox list or the group info page is open', () => {
    expect(shouldShow(dm, ctx({ pathname: '/inbox/55555555-5555-4555-8555-555555555555' }))).toBe(true)
    expect(shouldShow(dm, ctx({ pathname: '/inbox' }))).toBe(true)
    expect(shouldShow(group, ctx({ pathname: `/inbox/${GROUP}` }))).toBe(true) // a 1:1 thread with the same id is not the group
    expect(shouldShow(group, ctx({ pathname: `/inbox/g/${GROUP}/info` }))).toBe(true)
  })
})

describe('messageLine', () => {
  it('private: "<nick>: <text>"', () => {
    expect(messageLine({ nick: 'דני', text: 'מה קורה?' })).toBe('דני: מה קורה?')
  })

  it('cannot decrypt → "הודעה חדשה מ־<nick>"', () => {
    expect(messageLine({ nick: 'דני', text: null })).toBe('הודעה חדשה מ־דני')
    expect(messageLine({ nick: 'דני', text: '   ' })).toBe('הודעה חדשה מ־דני')
  })

  it('group: "<group> · <nick>: <text>", fallback keeps the group', () => {
    expect(messageLine({ nick: 'דני', text: 'יאללה', group: 'שער 11' })).toBe('שער 11 · דני: יאללה')
    expect(messageLine({ nick: 'דני', text: null, group: 'שער 11' })).toBe('שער 11 · הודעה חדשה מ־דני')
  })

  it('unknown nick → "אוהד"', () => {
    expect(messageLine({ nick: null, text: 'היי' })).toBe('אוהד: היי')
  })

  it('folds line breaks and cuts very long text', () => {
    expect(messageLine({ nick: 'דני', text: 'שורה\nשנייה' })).toBe('דני: שורה שנייה')
    const long = messageLine({ nick: 'דני', text: 'א'.repeat(500) })
    expect(long.length).toBeLessThanOrEqual(160)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('inviteLine', () => {
  it('names the group when known', () => {
    expect(inviteLine('שער 11')).toBe('הזמנה לקבוצה שער 11')
    expect(inviteLine(null)).toBe('הזמנה לקבוצה חדשה')
  })
})

describe('bannerHref', () => {
  it('opens the match, the chat, the group or the inbox', () => {
    expect(bannerHref(match)).toBe('/matches/77')
    expect(bannerHref(dm)).toBe(`/inbox/${THREAD}`)
    expect(bannerHref(group)).toBe(`/inbox/g/${GROUP}`)
    expect(bannerHref(invite)).toBe('/inbox')
  })
})

describe('parseAlertPayload', () => {
  it('reads the alerts broadcast', () => {
    expect(parseAlertPayload({ id: 9, fixture_id: 77, kind: 'goal', home_goals: 1, away_goals: 0, scoring_api_id: 604 })).toEqual({ id: 9, fixtureId: 77 })
  })
  it('rejects anything else', () => {
    expect(parseAlertPayload({ id: 'x', fixture_id: 77 })).toBeNull()
    expect(parseAlertPayload(null)).toBeNull()
  })
})

describe('parseInboxEvent', () => {
  it('private message, group message, invite', () => {
    expect(parseInboxEvent('message', { thread_id: THREAD, from: OTHER })).toEqual(dm)
    expect(parseInboxEvent('message', { group_id: GROUP, from: OTHER })).toEqual(group)
    expect(parseInboxEvent('invite', { group_id: GROUP })).toEqual(invite)
  })
  it('rejects unknown events and malformed ids', () => {
    expect(parseInboxEvent('typing', { thread_id: THREAD, from: OTHER })).toBeNull()
    expect(parseInboxEvent('message', { thread_id: '../x', from: OTHER })).toBeNull()
    expect(parseInboxEvent('message', { from: OTHER })).toBeNull()
  })
})

describe('arrivalGate', () => {
  it('lookups finishing in order are each shown', () => {
    const g = arrivalGate()
    const a = g.arrive()
    const b = g.arrive()
    expect(g.claim(a)).toBe(true)
    expect(g.claim(b)).toBe(true)
  })

  it('an older lookup finishing after a newer one is on screen never replaces it', () => {
    const g = arrivalGate()
    const older = g.arrive()
    const newer = g.arrive()
    expect(g.claim(newer)).toBe(true)
    expect(g.claim(older)).toBe(false)
  })

  it('an older event is still shown when the newer one was filtered out (never claimed)', () => {
    const g = arrivalGate()
    const older = g.arrive()
    g.arrive() // e.g. a muted group: dropped without claiming
    expect(g.claim(older)).toBe(true)
  })
})

describe('trip events (activity bell)', () => {
  const TRIP = '55555555-5555-4555-8555-555555555555'
  const req = { kind: 'trip', activity: 'trip_request' } as const
  const acc = { kind: 'trip', activity: 'trip_accepted', tripId: TRIP } as const

  it('`activity` broadcasts: trip kinds become a banner, likes never do', () => {
    expect(parseInboxEvent('activity', { kind: 'trip_request' })).toEqual(req)
    expect(parseInboxEvent('activity', { kind: 'trip_accepted', id: 'x' })).toEqual({ kind: 'trip', activity: 'trip_accepted' })
    expect(parseInboxEvent('activity', { kind: 'clip_like' })).toBeNull()
    expect(parseInboxEvent('activity', { kind: 'photo_like' })).toBeNull()
    expect(parseInboxEvent('activity', { kind: 'nope' })).toBeNull()
  })

  it('always on: the message and match settings do not affect them', () => {
    expect(shouldShow(req, ctx({ prefs: { matches: 'off', messages: false } }))).toBe(true)
    expect(shouldShow(acc, ctx({ prefs: { matches: 'off', messages: false } }))).toBe(true)
  })

  it("not shown while that trip's screen is open; shown on other trips or elsewhere", () => {
    expect(shouldShow(acc, ctx({ pathname: '/stand/trips', search: `?trip=${TRIP}` }))).toBe(false)
    expect(shouldShow(acc, ctx({ pathname: '/stand/trips/', search: `?x=1&trip=${TRIP}` }))).toBe(false)
    expect(shouldShow(acc, ctx({ pathname: '/stand/trips', search: '?trip=other' }))).toBe(true)
    expect(shouldShow(acc, ctx({ pathname: '/stand/trips' }))).toBe(true)
    expect(shouldShow(acc, ctx({ pathname: '/activity', search: `?trip=${TRIP}` }))).toBe(true)
    // Before the lookup the trip is not known yet: allowed, checked again after.
    expect(shouldShow(req, ctx({ pathname: '/stand/trips', search: `?trip=${TRIP}` }))).toBe(true)
  })

  it('tap → the trip', () => {
    expect(bannerHref(acc)).toBe(`/stand/trips?trip=${TRIP}`)
    expect(bannerHref(req)).toBe('/stand/trips')
  })
})

describe('tripRowGate', () => {
  const now = Date.parse('2026-10-14T12:00:00Z')
  const at = (min: number) => new Date(now - min * 60_000).toISOString()

  it('a new row is news once', () => {
    const g = tripRowGate()
    expect(g.take('trip_request', at(0), now)).toBe(true)
    expect(g.take('trip_request', at(0), now)).toBe(false)
  })

  it('a withdrawal leaves an older row on top: never shown', () => {
    const g = tripRowGate()
    expect(g.take('trip_request', at(1), now)).toBe(true) // B arrives
    expect(g.take('trip_request', at(3), now)).toBe(false) // B withdrawn: A (older) is the newest again
  })

  it('kinds are apart; an old row (beyond 10 minutes) is not news', () => {
    const g = tripRowGate()
    expect(g.take('trip_request', at(1), now)).toBe(true)
    expect(g.take('trip_accepted', at(2), now)).toBe(true)
    expect(tripRowGate().take('trip_accepted', at(11), now)).toBe(false)
    expect(tripRowGate().take('trip_accepted', 'x', now)).toBe(false)
  })
})
