// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { config } from './proxy'

vi.mock('@/lib/supabase/proxy', () => ({ updateSession: vi.fn() }))

const runs = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path))

describe('session proxy matcher', () => {
  it('skips /api/alerts (no Set-Cookie on CDN-cached alert text, no session refresh per goal)', () => {
    expect(runs('/api/alerts/42')).toBe(false)
    expect(runs('/api/alerts/dispatch')).toBe(false)
  })
  it('still runs for pages and other routes', () => {
    expect(runs('/stand')).toBe(true)
    expect(runs('/matches/77')).toBe(true)
    expect(runs('/auth/callback')).toBe(true)
  })
})
