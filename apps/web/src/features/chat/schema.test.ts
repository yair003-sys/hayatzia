import { describe, expect, it } from 'vitest'
import { chatTime, hasNewTail, mergeMessages, messageFromBroadcast, sendMessageSchema, type ChatMessage } from './schema'

const msg = (id: string, created_at: string, body = 'x'): ChatMessage => ({ id, user_id: 'u', nick: 'n', body, created_at })

describe('mergeMessages', () => {
  it('keeps oldest first and drops duplicates (server echo + realtime)', () => {
    const a = msg('a', '2026-10-11T19:00:00.000Z')
    const b = msg('b', '2026-10-11T19:01:00.000Z')
    expect(mergeMessages([b], [a, b]).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('orders ties by id so the order is stable', () => {
    const t = '2026-10-11T19:00:00.000Z'
    expect(mergeMessages([], [msg('z', t), msg('c', t)]).map((m) => m.id)).toEqual(['c', 'z'])
  })
})

describe('messageFromBroadcast', () => {
  it('reads the record of a database broadcast', () => {
    const record = msg('a', '2026-10-11T19:00:00.000Z', 'שלום')
    expect(messageFromBroadcast({ record, operation: 'INSERT' })).toEqual(record)
  })

  it('keeps the side of match-room messages', () => {
    expect(messageFromBroadcast({ record: { ...msg('a', '2026-10-11T19:00:00.000Z'), side: 'a' } })?.side).toBe('a')
  })

  it('ignores unexpected payloads', () => {
    expect(messageFromBroadcast(null)).toBeNull()
    expect(messageFromBroadcast({ record: { id: 1 } })).toBeNull()
  })
})

describe('sendMessageSchema', () => {
  it('trims and rejects empty or too long text', () => {
    expect(sendMessageSchema.parse({ body: '  יאללה  ' }).body).toBe('יאללה')
    expect(sendMessageSchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(sendMessageSchema.safeParse({ body: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('chatTime', () => {
  it('shows Israel time', () => {
    expect(chatTime('2026-10-11T19:07:00.000Z')).toBe('22:07')
  })
})

describe('hasNewTail', () => {
  const m = (id: string): ChatMessage => ({ id, user_id: 'u', nick: 'n', body: 'b', created_at: '2026-10-12T10:00:00Z' })
  it('is true when a new message arrives at the end', () => {
    expect(hasNewTail([m('a')], [m('a'), m('b')])).toBe(true)
    expect(hasNewTail([], [m('a')])).toBe(true)
  })
  it('is false when only older messages were added or nothing changed', () => {
    expect(hasNewTail([m('b')], [m('a'), m('b')])).toBe(false)
    expect(hasNewTail([m('a')], [m('a')])).toBe(false)
  })
})
