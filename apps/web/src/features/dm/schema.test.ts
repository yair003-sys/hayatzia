import { describe, expect, it } from 'vitest'
import {
  avatarOf,
  createGroupSchema,
  filterInbox,
  groupErrorHe,
  groupNameSchema,
  orderedPair,
  previewText,
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
  })
  it('falls back for unknown codes', () => {
    expect(groupErrorHe('bad_kind')).toBe('הפעולה נכשלה. נסה שוב')
    expect(groupErrorHe('whatever')).toBe('הפעולה נכשלה. נסה שוב')
  })
})
