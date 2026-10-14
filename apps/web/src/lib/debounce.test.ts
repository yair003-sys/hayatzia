import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a burst runs once, after it is quiet', () => {
    const fn = vi.fn()
    const d = debounce(fn, 500, 3000)
    d.call()
    vi.advanceTimersByTime(300)
    d.call()
    vi.advanceTimersByTime(499)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('a steady stream still runs by the max wait', () => {
    const fn = vi.fn()
    const d = debounce(fn, 500, 3000)
    for (let t = 0; t < 3000; t += 400) {
      d.call()
      vi.advanceTimersByTime(400)
    }
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel drops the pending run; the next burst starts fresh', () => {
    const fn = vi.fn()
    const d = debounce(fn, 500, 3000)
    d.call()
    d.cancel()
    vi.advanceTimersByTime(5000)
    expect(fn).not.toHaveBeenCalled()
    d.call()
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
