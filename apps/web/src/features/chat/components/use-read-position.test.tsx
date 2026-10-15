import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFollowEnd } from './use-read-position'

// The end of the chat is never on screen in these tests: the observer never reports.
class NoIntersection {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const m = (id: string) => ({ id })

describe('useFollowEnd: the "go down" badge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', NoIntersection)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('counts new messages in a room that opens scrolled up (the match room)', () => {
    const bottom = { current: document.createElement('div') }
    const { result, rerender } = renderHook(({ items }) => useFollowEnd(items, bottom, { enabled: true, initialAtBottom: false }), {
      initialProps: { items: [m('a'), m('b')] },
    })
    expect(result.current.atBottom).toBe(false)
    expect(result.current.unread).toBe(0)
    rerender({ items: [m('a'), m('b'), m('c')] })
    expect(result.current.unread).toBe(1)
  })

  it('starts counting after a history that loads later (private messages)', () => {
    const bottom = { current: document.createElement('div') }
    const { result, rerender } = renderHook(({ items }) => useFollowEnd(items, bottom, { enabled: true, initialAtBottom: false }), {
      initialProps: { items: [] as { id: string }[] },
    })
    rerender({ items: [m('a'), m('b')] })
    act(() => {
      vi.runAllTimers()
    })
    expect(result.current.unread).toBe(0)
    rerender({ items: [m('a'), m('b'), m('c'), m('d')] })
    expect(result.current.unread).toBe(2)
  })
})
