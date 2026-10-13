import { afterEach, describe, expect, it, vi } from 'vitest'
import { whileVisible } from './while-visible'

let state: DocumentVisibilityState = 'visible'
const setVisibility = (s: DocumentVisibilityState) => {
  state = s
  document.dispatchEvent(new Event('visibilitychange'))
}
vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state)

afterEach(() => {
  state = 'visible'
})

describe('whileVisible', () => {
  it('starts now when visible, stops on hidden, starts again on visible, once each', () => {
    const stop = vi.fn()
    const start = vi.fn(() => stop)
    const cleanup = whileVisible(start)
    expect(start).toHaveBeenCalledTimes(1)
    setVisibility('hidden')
    setVisibility('hidden')
    expect(stop).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    setVisibility('visible')
    expect(start).toHaveBeenCalledTimes(2)
    cleanup()
    expect(stop).toHaveBeenCalledTimes(2)
    setVisibility('hidden')
    setVisibility('visible')
    expect(start).toHaveBeenCalledTimes(2) // no longer listening after cleanup
  })

  it('does not start while hidden, and cleanup then stops nothing', () => {
    state = 'hidden'
    const stop = vi.fn()
    const start = vi.fn(() => stop)
    const cleanup = whileVisible(start)
    expect(start).not.toHaveBeenCalled()
    setVisibility('visible')
    expect(start).toHaveBeenCalledTimes(1)
    setVisibility('hidden')
    cleanup()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
