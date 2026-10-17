// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'onefan_design' && state.cookie !== undefined ? { value: state.cookie } : undefined) }),
}))

import { designFromValue, designVersion, DESIGN_COOKIE } from './design-version'

beforeEach(() => {
  state.cookie = undefined
})

describe('designFromValue: only "stadium" opts in', () => {
  it('returns stadium for the stadium value', () => {
    expect(designFromValue('stadium')).toBe('stadium')
  })
  it('returns classic for a missing, empty or unknown value', () => {
    expect(designFromValue(undefined)).toBe('classic')
    expect(designFromValue('')).toBe('classic')
    expect(designFromValue('classic')).toBe('classic')
    expect(designFromValue('STADIUM')).toBe('classic')
    expect(designFromValue('anything')).toBe('classic')
  })
})

describe('designVersion: reads the per-browser cookie', () => {
  it('defaults to classic with no cookie', async () => {
    expect(await designVersion()).toBe('classic')
  })
  it('is stadium only when the cookie is exactly "stadium"', async () => {
    state.cookie = 'stadium'
    expect(await designVersion()).toBe('stadium')
    state.cookie = 'nope'
    expect(await designVersion()).toBe('classic')
  })
  it('uses the agreed cookie name', () => {
    expect(DESIGN_COOKIE).toBe('onefan_design')
  })
})
