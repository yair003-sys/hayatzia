import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { countTyping, createThrottle, createTypingSignal, typingLabel } from './typing'

describe('countTyping', () => {
  it('counts distinct typing fans, never me, never hidden fans', () => {
    const state = {
      me: [{ user_id: 'me', typing: true }],
      a: [{ user_id: 'a', typing: true }, { user_id: 'a', typing: true }], // two tabs count once
      b: [{ user_id: 'b', typing: false }],
      c: [{ user_id: 'c' }],
      d: [{ user_id: 'd', typing: false }, { user_id: 'd', typing: true }], // typing in one tab
      blocked: [{ user_id: 'blocked', typing: true }],
      e: [{ typing: true }], // no user_id: the presence key is the fan
    }
    expect(countTyping(state, 'me', ['blocked'])).toBe(3)
  })

  it('ignores a typing flag that is not exactly true', () => {
    expect(countTyping({ a: [{ user_id: 'a', typing: 'yes' }], b: [{ user_id: 'b', typing: 1 }] }, 'me')).toBe(0)
  })

  it('hides by key as well as by user_id', () => {
    expect(countTyping({ x: [{ user_id: 'me', typing: true }], blocked: [{ user_id: 'z', typing: true }] }, 'me', ['blocked'])).toBe(0)
  })

  it('is zero for an empty state', () => {
    expect(countTyping({}, 'me')).toBe(0)
  })
})

describe('typingLabel', () => {
  it('is empty for nobody, singular for one, a number for more', () => {
    expect(typingLabel(0)).toBe('')
    expect(typingLabel(1)).toBe('אוהד אחד כותב…')
    expect(typingLabel(2)).toBe('2 אוהדים כותבים…')
    expect(typingLabel(1200)).toBe('1,200 אוהדים כותבים…')
  })
})

describe('createThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends a change at once, then at most once per window, with the latest value', () => {
    const send = vi.fn()
    const t = createThrottle(send, 2000, 'a')
    t.set('b')
    expect(send).toHaveBeenLastCalledWith('b')
    t.set('c')
    t.set('d')
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1999)
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith('d')
  })

  it('sends nothing when the value comes back to what was sent', () => {
    const send = vi.fn()
    const t = createThrottle(send, 2000, false)
    t.set(true)
    t.set(false)
    t.set(true)
    vi.advanceTimersByTime(5000)
    expect(send).toHaveBeenCalledTimes(1)
    expect(t.sent()).toBe(true)
  })

  it('dispose drops a pending send', () => {
    const send = vi.fn()
    const t = createThrottle(send, 2000, 0)
    t.set(1)
    t.set(2)
    t.dispose()
    vi.advanceTimersByTime(5000)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('createTypingSignal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says "typing" on the first keystroke and not again while the fan keeps typing', () => {
    const send = vi.fn()
    const s = createTypingSignal(send)
    for (let i = 0; i < 30; i++) {
      s.input()
      vi.advanceTimersByTime(300)
    }
    expect(send.mock.calls).toEqual([[true]])
  })

  it('says "stopped" after 4 s without a keystroke', () => {
    const send = vi.fn()
    const s = createTypingSignal(send)
    s.input()
    vi.advanceTimersByTime(3999)
    expect(send.mock.calls).toEqual([[true]])
    vi.advanceTimersByTime(1)
    expect(send.mock.calls).toEqual([[true], [false]])
  })

  it('stop (sent, blur, empty box) says "stopped", within the 2 s window', () => {
    const send = vi.fn()
    const s = createTypingSignal(send)
    s.input()
    s.stop()
    expect(send.mock.calls).toEqual([[true]])
    vi.advanceTimersByTime(2000)
    expect(send.mock.calls).toEqual([[true], [false]])
    vi.advanceTimersByTime(10_000)
    expect(send).toHaveBeenCalledTimes(2) // the idle timer was cleared
  })

  it('never makes more than one call per 2 s, even when the fan sends and types again quickly', () => {
    const send = vi.fn()
    const s = createTypingSignal(send)
    const at: number[] = []
    send.mockImplementation(() => at.push(Date.now()))
    for (let i = 0; i < 20; i++) {
      s.input()
      vi.advanceTimersByTime(200)
      s.stop()
      vi.advanceTimersByTime(300)
    }
    vi.advanceTimersByTime(10_000)
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(2000)
    expect(send).toHaveBeenLastCalledWith(false)
  })

  it('dispose says "stopped" at once when the fan was shown typing, and nothing otherwise', () => {
    const send = vi.fn()
    const s = createTypingSignal(send)
    s.input()
    s.dispose()
    expect(send.mock.calls).toEqual([[true], [false]])
    vi.advanceTimersByTime(10_000)
    expect(send).toHaveBeenCalledTimes(2)

    const quiet = vi.fn()
    createTypingSignal(quiet).dispose()
    expect(quiet).not.toHaveBeenCalled()
  })
})
