import { describe, expect, it } from 'vitest'
import {
  avatarOf,
  createGroupSchema,
  eventLine,
  filterInbox,
  groupErrorHe,
  groupNameSchema,
  membersLabel,
  orderedPair,
  pickDevices,
  previewText,
  recipientsFor,
  unreadLabel,
  type InboxRow,
} from './schema'

describe('orderedPair', () => {
  it('always puts the smaller id first', () => {
    const a = '00000000-0000-0000-0000-000000000001'
    const b = '00000000-0000-0000-0000-000000000002'
    expect(orderedPair(b, a)).toEqual({ user_a: a, user_b: b })
    expect(orderedPair(a, b)).toEqual({ user_a: a, user_b: b })
  })
})

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('inbox helpers', () => {
  it('unreadLabel', () => {
    expect(unreadLabel(0)).toBeNull()
    expect(unreadLabel(3)).toBe('3')
    expect(unreadLabel(9)).toBe('9')
    expect(unreadLabel(12)).toBe('9+')
  })

  it('avatarOf', () => {
    const a = avatarOf('abc', 'דני')
    expect(a.initial).toBe('ד')
    expect(avatarOf('abc', 'אחר').hue).toBe(a.hue)
    expect(a.hue).toBeGreaterThanOrEqual(0)
    expect(a.hue).toBeLessThan(360)
  })

  it('previewText', () => {
    expect(previewText({ text: null, senderNick: null, mine: false, group: false })).toBe('הודעה מוצפנת')
    expect(previewText({ text: 'נפגשים בשער 5', senderNick: 'דני', mine: false, group: true })).toBe('דני: נפגשים בשער 5')
    expect(previewText({ text: 'היי', senderNick: null, mine: true, group: false })).toBe('אתה: היי')
    expect(previewText({ text: 'היי', senderNick: 'דני', mine: false, group: false })).toBe('היי')
    const long = previewText({ text: 'א'.repeat(80), senderNick: null, mine: false, group: false })
    expect(long).toHaveLength(61)
    expect(long.endsWith('…')).toBe(true)
    expect(previewText({ text: 'א \n\n  ב', senderNick: null, mine: false, group: false })).toBe('א ב')
  })

  it('groupNameSchema', () => {
    expect(groupNameSchema.safeParse('א').success).toBe(false)
    expect(groupNameSchema.safeParse('א'.repeat(41)).success).toBe(false)
    expect(groupNameSchema.safeParse('  קבוצה  ').data).toBe('קבוצה')
  })

  it('createGroupSchema', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => uid(i + 1))
    expect(createGroupSchema.safeParse({ name: 'קבוצה', memberIds: ids(19) }).success).toBe(true)
    expect(createGroupSchema.safeParse({ name: 'קבוצה', memberIds: ids(20) }).success).toBe(false)
    expect(createGroupSchema.safeParse({ name: 'קבוצה', memberIds: [uid(1), uid(1)] }).success).toBe(false)
    expect(createGroupSchema.safeParse({ name: 'קבוצה', memberIds: [] }).success).toBe(false)
  })

  it('filterInbox', () => {
    const row = (name: string): InboxRow => ({
      kind: 'group', id: name, name, otherId: null, lastAt: '', lastFrom: null,
      lastMessageId: null, unread: 0, members: 3, muted: false,
    })
    const rows = [row('מכבי בדרך'), row('חברים')]
    expect(filterInbox(rows, 'מכב').map((r) => r.name)).toEqual(['מכבי בדרך'])
    expect(filterInbox(rows, '  ')).toHaveLength(2)
  })
})

describe('groupErrorHe', () => {
  it('maps known codes to Hebrew messages', () => {
    expect(groupErrorHe('group_full')).toBe('הקבוצה מלאה (עד 20 אוהדים)')
    expect(groupErrorHe('not_admin')).toBe('רק מנהל הקבוצה יכול לעשות את זה')
    expect(groupErrorHe('blocked')).toBe('אי אפשר להוסיף את האוהד הזה')
    expect(groupErrorHe('not_same_team')).toBe('אפשר להזמין רק אוהדים מהקבוצה שלך')
    expect(groupErrorHe('invite_expired')).toBe('ההזמנה פגה')
    expect(groupErrorHe('no_members')).toBe('בחר לפחות אוהד אחד')
    expect(groupErrorHe('not_member')).toBe('ההזמנה כבר לא בתוקף, או שאתה כבר לא בקבוצה')
    expect(groupErrorHe('bad_name')).toBe('שם הקבוצה צריך להיות 2–40 תווים')
  })
  it('falls back for unknown codes', () => {
    expect(groupErrorHe('bad_kind')).toBe('הפעולה נכשלה. נסה שוב')
    expect(groupErrorHe('whatever')).toBe('הפעולה נכשלה. נסה שוב')
  })
})

describe('recipientsFor', () => {
  const me = 'me'
  it('keeps admins and members, never invitees', () => {
    const r = recipientsFor([
      { userId: 'me', role: 'admin' },
      { userId: 'a', role: 'member' },
      { userId: 'b', role: 'invited' },
    ], [], me)
    expect(r.sort()).toEqual(['a', 'me'])
  })
  it('leaves out fans I blocked', () => {
    const r = recipientsFor([
      { userId: 'me', role: 'member' },
      { userId: 'a', role: 'admin' },
      { userId: 'c', role: 'member' },
    ], ['c'], me)
    expect(r.sort()).toEqual(['a', 'me'])
  })
  it('always includes me, even when my row is missing', () => {
    expect(recipientsFor([{ userId: 'a', role: 'member' }], [], me)).toContain('me')
  })
  it('de-duplicates', () => {
    const r = recipientsFor([
      { userId: 'me', role: 'admin' },
      { userId: 'a', role: 'member' },
      { userId: 'a', role: 'member' },
    ], [], me)
    expect(r.filter((x) => x === 'a')).toHaveLength(1)
    expect(r.filter((x) => x === 'me')).toHaveLength(1)
  })
})

describe('membersLabel', () => {
  it('says one member in words and many with a number', () => {
    expect(membersLabel(1)).toBe('חבר אחד')
    expect(membersLabel(2)).toBe('2 חברים')
    expect(membersLabel(20)).toBe('20 חברים')
  })
})

describe('eventLine', () => {
  it('builds system lines from nicknames only', () => {
    expect(eventLine('join', 'דני')).toBe('דני הצטרף')
    expect(eventLine('leave', 'יוסי')).toBe('יוסי עזב')
    expect(eventLine('remove', 'רון')).toBe('המנהל הוציא את רון')
    expect(eventLine('rename', '')).toBe('שם הקבוצה שונה')
  })
})

describe('pickDevices', () => {
  const dev = (user_id: string, id: string, day: number) => ({ user_id, id, created_at: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z` })
  const all = [
    dev('a', 'a1', 1),
    dev('a', 'a2', 2),
    dev('a', 'a3', 3),
    dev('a', 'a4', 4),
    dev('a', 'a5', 5),
    dev('me', 'm1', 1),
    dev('me', 'm2', 6),
    dev('me', 'm3', 7),
    dev('me', 'm4', 8),
    dev('b', 'b1', 1),
  ]
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort()

  it('keeps the newest devices of each fan', () => {
    const r = pickDevices(all, 3, { user_id: 'me', id: 'm4' })
    expect(ids(r.filter((d) => d.user_id === 'a'))).toEqual(['a3', 'a4', 'a5'])
    expect(ids(r.filter((d) => d.user_id === 'b'))).toEqual(['b1'])
  })
  it('keeps this device even when it is older than my other devices', () => {
    const r = pickDevices(all, 3, { user_id: 'me', id: 'm1' })
    expect(ids(r.filter((d) => d.user_id === 'me'))).toEqual(['m1', 'm3', 'm4'])
  })
  it('never keeps more than perUser per fan', () => {
    const r = pickDevices(all, 3, { user_id: 'me', id: 'm1' })
    for (const u of ['a', 'b', 'me']) expect(r.filter((d) => d.user_id === u).length).toBeLessThanOrEqual(3)
    expect(r).toHaveLength(7)
  })
})
