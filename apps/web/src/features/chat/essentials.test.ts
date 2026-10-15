import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dayKey,
  echoMatch,
  failurePlan,
  dayLabel,
  laterMark,
  loadMark,
  replySnippet,
  saveMark,
  sendState,
  startsNewDay,
  tickInfo,
  unreadDividerLabel,
  unreadFrom,
} from './essentials'
import { chatTime } from './schema'

describe('day separators (Israel time)', () => {
  it('uses the Israel calendar day, not UTC', () => {
    // 21:30 UTC on the 14th is 00:30 on the 15th in Israel (summer time, UTC+3).
    expect(dayKey('2026-10-14T21:30:00Z')).toBe('2026-10-15')
    expect(dayKey('2026-10-14T20:59:00Z')).toBe('2026-10-14')
  })

  it('starts a new day after midnight in Israel', () => {
    expect(startsNewDay(undefined, '2026-10-14T10:00:00Z')).toBe(true)
    expect(startsNewDay('2026-10-14T10:00:00Z', '2026-10-14T20:00:00Z')).toBe(false)
    expect(startsNewDay('2026-10-14T20:00:00Z', '2026-10-14T21:30:00Z')).toBe(true)
  })

  it('says today, yesterday, or the date', () => {
    const now = Date.parse('2026-10-15T09:00:00Z')
    expect(dayLabel('2026-10-15T05:00:00Z', now)).toBe('היום')
    expect(dayLabel('2026-10-14T21:30:00Z', now)).toBe('היום')
    expect(dayLabel('2026-10-14T12:00:00Z', now)).toBe('אתמול')
    expect(dayLabel('2026-10-12T12:00:00Z', now)).toContain('12')
    expect(dayLabel('2026-10-12T12:00:00Z', now)).not.toContain('2026')
    expect(dayLabel('2025-10-12T12:00:00Z', now)).toContain('2025')
  })

  it('shows the full date before the clock is known', () => {
    expect(dayLabel('2026-10-15T05:00:00Z', null)).toContain('2026')
  })

  it('formats the time of a message in Israel', () => {
    expect(chatTime('2026-10-14T21:30:00Z')).toBe('00:30')
    // Winter time (UTC+2) after the clocks change.
    expect(chatTime('2026-12-01T10:05:00Z')).toBe('12:05')
  })
})

type M = { id: string; created_at: string; mine?: boolean }
const at = (min: number) => new Date(Date.UTC(2026, 9, 15, 10, min)).toISOString()
const m = (id: string, min: number, mine = false): M => ({ id, created_at: at(min), mine })
const isMine = (x: M) => !!x.mine

describe('unreadFrom', () => {
  const list = [m('a', 1), m('b', 2), m('c', 3), m('d', 4)]

  it('points at the first message after the mark and counts the rest', () => {
    expect(unreadFrom(list, { id: 'b', at: at(2) }, isMine)).toEqual({ index: 2, count: 2, more: false })
  })

  it('shows nothing on a first visit or when everything was read', () => {
    expect(unreadFrom(list, null, isMine).index).toBe(-1)
    expect(unreadFrom(list, { id: 'd', at: at(4) }, isMine).index).toBe(-1)
  })

  it('orders messages of the same second by id', () => {
    const same = [m('a', 1), m('b', 1), m('c', 1)]
    expect(unreadFrom(same, { id: 'a', at: at(1) }, isMine)).toEqual({ index: 1, count: 2, more: false })
  })

  it('skips my own messages and counts only after my last one', () => {
    expect(unreadFrom([m('a', 1), m('b', 2, true), m('c', 3)], { id: 'a', at: at(1) }, isMine)).toEqual({ index: 2, count: 1, more: false })
    expect(unreadFrom([m('a', 1), m('b', 2), m('c', 3, true)], { id: 'a', at: at(1) }, isMine).index).toBe(-1)
  })

  it('flags more unread above when the mark is older than everything loaded', () => {
    expect(unreadFrom(list, { id: 'zz', at: at(0) }, isMine)).toEqual({ index: 0, count: 4, more: true })
  })

  it('labels the divider', () => {
    expect(unreadDividerLabel(1)).toBe('הודעה אחת שלא נקראה')
    expect(unreadDividerLabel(5)).toBe('5 הודעות שלא נקראו')
    expect(unreadDividerLabel(50, true)).toBe('50+ הודעות שלא נקראו')
  })
})

describe('read marks on the device', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const fakeStorage = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
  }

  it('never moves backwards', () => {
    const a = { id: 'a', at: at(1) }
    const b = { id: 'b', at: at(2) }
    expect(laterMark(a, b)).toBe(b)
    expect(laterMark(b, a)).toBe(b)
    expect(laterMark(null, a)).toBe(a)
  })

  it('saves and reads a mark, keeping the newer one', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    saveMark('team:mta', { id: 'b', at: at(2) })
    saveMark('team:mta', { id: 'a', at: at(1) })
    expect(loadMark('team:mta')).toEqual({ id: 'b', at: at(2) })
    expect(loadMark('team:hta')).toBeNull()
  })

  it('survives blocked storage', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })
    expect(() => saveMark('team:mta', { id: 'a', at: at(1) })).not.toThrow()
    expect(loadMark('team:mta')).toBeNull()
  })
})

describe('ticks', () => {
  it('follows the message from sending to saved or failed', () => {
    expect(sendState({ id: 'local-1' })).toBe('sending')
    expect(sendState({ id: 'local-1', failed: true })).toBe('failed')
    expect(sendState({ id: '3f1c0a9e-0000-4000-8000-000000000000' })).toBe('sent')
  })

  it('shows one tick while sending, two once saved, none when failed', () => {
    expect(tickInfo('sending')).toEqual({ ticks: 1, label: 'בשליחה' })
    expect(tickInfo('sent')).toEqual({ ticks: 2, label: 'נשלח' })
    expect(tickInfo('failed').ticks).toBe(0)
  })
})

describe('replySnippet', () => {
  it('keeps short text on one line', () => {
    expect(replySnippet('  יאללה\n\nמכבי  ')).toBe('יאללה מכבי')
  })

  it('cuts at 80 characters like the server snapshot', () => {
    const long = 'א'.repeat(120)
    expect(replySnippet(long)).toBe('א'.repeat(80) + '…')
    expect(replySnippet('א'.repeat(80))).toBe('א'.repeat(80))
  })

  it('never splits an emoji', () => {
    expect(replySnippet('⚽'.repeat(3), 2)).toBe('⚽⚽…')
  })
})

describe('echoMatch (my own message coming back on the live channel)', () => {
  type P = { id: string; body: string; failed?: boolean; reply_to?: string | null }
  const body = (p: P) => p.body
  const echo = (id: string, text: string, reply_to: string | null = null) => ({ id, text, reply_to })

  it('replaces the oldest copy still sending with the same text and reply', () => {
    const pending: P[] = [{ id: 'local-1', body: 'גול' }, { id: 'local-2', body: 'גול' }]
    expect(echoMatch(pending, echo('s1', 'גול'), new Set(), body)).toBe(0)
    expect(echoMatch([{ id: 'local-1', body: 'גול', reply_to: 'x' }], echo('s1', 'גול'), new Set(), body)).toBe(-1)
    expect(echoMatch([{ id: 'local-1', body: 'גול', failed: true }], echo('s1', 'גול'), new Set(), body)).toBe(-1)
  })

  it('leaves a newer same-text message alone when the send already confirmed the echoed one', () => {
    // "גול" was sent, confirmed (s1) and its copy removed; a second "גול" is on its way when s1's echo arrives.
    const pending: P[] = [{ id: 'local-2', body: 'גול' }]
    expect(echoMatch(pending, echo('s1', 'גול'), new Set(['s1']), body)).toBe(-1)
    expect(echoMatch(pending, echo('s2', 'גול'), new Set(['s1']), body)).toBe(0)
  })
})

describe('failurePlan', () => {
  it('keeps "נסה שוב" only for passing failures', () => {
    expect(failurePlan('retry')).toEqual({ keepBubble: true, restoreText: false, restoreQuote: false })
    expect(failurePlan()).toEqual({ keepBubble: true, restoreText: false, restoreQuote: false })
  })

  it('puts a refused text back, with its quote unless the quote is gone', () => {
    expect(failurePlan('permanent')).toEqual({ keepBubble: false, restoreText: true, restoreQuote: true })
    expect(failurePlan('bad_reply')).toEqual({ keepBubble: false, restoreText: true, restoreQuote: false })
  })
})
