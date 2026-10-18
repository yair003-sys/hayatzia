// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_FEATURE_RIDES: 'off' as 'on' | 'off',
    NEXT_PUBLIC_FEATURE_MARKET: 'off' as 'on' | 'off',
    NEXT_PUBLIC_FEATURE_EVENTS: 'off' as 'on' | 'off',
  },
}))
vi.mock('@/lib/env', () => ({ env: mocks.env }))

afterEach(() => {
  mocks.env.NEXT_PUBLIC_FEATURE_RIDES = 'off'
  mocks.env.NEXT_PUBLIC_FEATURE_MARKET = 'off'
  mocks.env.NEXT_PUBLIC_FEATURE_EVENTS = 'off'
  vi.resetModules()
})

async function load() {
  vi.resetModules()
  return (await import('./flags')).features
}

describe('launch feature flags', () => {
  it('every flag is off by default (launch scope)', async () => {
    const features = await load()
    expect(features).toEqual({ rides: false, market: false, events: false })
  })

  it("a flag turns on only when its env var is exactly 'on'", async () => {
    mocks.env.NEXT_PUBLIC_FEATURE_MARKET = 'on'
    const features = await load()
    expect(features.market).toBe(true)
    expect(features.rides).toBe(false)
    expect(features.events).toBe(false)
  })

  it('rides, market and events are independent', async () => {
    mocks.env.NEXT_PUBLIC_FEATURE_RIDES = 'on'
    mocks.env.NEXT_PUBLIC_FEATURE_EVENTS = 'on'
    const features = await load()
    expect(features).toEqual({ rides: true, market: false, events: true })
  })
})
