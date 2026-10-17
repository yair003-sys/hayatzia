import { describe, expect, it } from 'vitest'
import {
  DM_REQUEST_OPTIONS,
  dmCode,
  dmErrorHe,
  dmRequestsSchema,
  qrCodeSchema,
  qrUrl,
  requestOf,
  requestState,
  splitRequests,
  type InboxRow,
} from './schema'

const ME = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'

describe('dmErrorHe (league-wide messages, 2026-10-16)', () => {
  it('maps the database codes to Hebrew', () => {
    // Security review 2026-10-17: a single generic refusal for a closed setting and a reached cap alike.
    const generic = 'לא ניתן לשלוח בקשת הודעה לאוהד הזה כרגע. נסו שוב מאוחר יותר'
    expect(dmErrorHe('requests_blocked')).toBe(generic)
    expect(dmErrorHe('requests_closed')).toBe(generic)
    expect(dmErrorHe('rate_limit')).toBe(generic)
    expect(dmErrorHe('awaiting_accept')).toBe('ההודעה נשלחה. אפשר לכתוב שוב כשיאשרו')
    expect(dmErrorHe('bad_code')).toBe('הברקוד לא תקף')
    expect(dmErrorHe('no_birth_date')).toBe('צריך להשלים תאריך לידה')
    expect(dmErrorHe('blocked')).toBe('אי אפשר לפתוח שיחה עם האוהד הזה')
    expect(dmErrorHe('self')).toBe('זה הברקוד שלך')
    expect(dmErrorHe('banned')).toMatch(/מושעה/)
    expect(dmErrorHe('')).toBe('פתיחת השיחה נכשלה. נסה שוב')
  })

  it('finds the code inside a database message', () => {
    expect(dmCode('ERROR: requests_closed (42501)')).toBe('requests_closed')
    expect(dmCode('new row violates')).toBe('')
  })
})

describe('message requests', () => {
  const t = (p: Partial<{ accepted_at: string | null; opened_by: string | null }>) => ({ accepted_at: null, opened_by: OTHER, ...p })

  it('an unaccepted thread someone else opened is an incoming request; mine is outgoing', () => {
    expect(requestOf(t({}), ME)).toBe('incoming')
    expect(requestOf(t({ opened_by: ME }), ME)).toBe('outgoing')
    expect(requestOf(t({ accepted_at: '2026-10-16T10:00:00Z' }), ME)).toBeNull()
    // Threads from before the change have no opener and are accepted.
    expect(requestOf(t({ opened_by: null, accepted_at: '2026-10-01T10:00:00Z' }), ME)).toBeNull()
  })

  it('the opener waits after the first message; the recipient decides', () => {
    expect(requestState({ request: 'outgoing', sentByMe: 0 })).toBe('open')
    expect(requestState({ request: 'outgoing', sentByMe: 1 })).toBe('waiting')
    expect(requestState({ request: 'incoming', sentByMe: 0 })).toBe('decide')
    expect(requestState({ request: null, sentByMe: 5 })).toBe('open')
  })

  it('splits requests out of the inbox, keeping the order', () => {
    const row = (id: string, request: InboxRow['request']): InboxRow => ({
      kind: 'dm', id, name: id, otherId: OTHER, lastAt: '', lastFrom: null, lastMessageId: null, unread: 0, members: null,
      muted: false, request, otherTeam: 'hta',
    })
    const { requests, rows } = splitRequests([row('a', null), row('b', 'incoming'), row('c', 'outgoing'), row('d', 'incoming')])
    expect(requests.map((r) => r.id)).toEqual(['b', 'd'])
    expect(rows.map((r) => r.id)).toEqual(['a', 'c'])
  })
})

describe('settings and QR code', () => {
  it('has exactly the three request settings', () => {
    expect(DM_REQUEST_OPTIONS.map((o) => o.value)).toEqual(['everyone', 'team', 'qr'])
    expect(DM_REQUEST_OPTIONS.map((o) => o.label)).toEqual(['כולם', 'רק אוהדי הקבוצה שלי', 'רק דרך ברקוד'])
    expect(dmRequestsSchema.safeParse({ value: 'team' }).success).toBe(true)
    expect(dmRequestsSchema.safeParse({ value: 'friends' }).success).toBe(false)
  })

  it('accepts only url-safe codes of 22+ characters', () => {
    expect(qrCodeSchema.safeParse({ code: 'abcDEF123_-abcDEF123_-x' }).success).toBe(true)
    expect(qrCodeSchema.safeParse({ code: 'short' }).success).toBe(false)
    expect(qrCodeSchema.safeParse({ code: 'abcDEF123_-abcDEF123_/x' }).success).toBe(false)
  })

  it('the QR encodes the add page of the site, never a user id', () => {
    expect(qrUrl('https://onefan.example', 'abcDEF123_-abcDEF123_-x')).toBe('https://onefan.example/add/abcDEF123_-abcDEF123_-x')
  })
})
