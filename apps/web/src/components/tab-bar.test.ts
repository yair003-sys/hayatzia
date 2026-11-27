import { describe, expect, it } from 'vitest'
import { activeTab } from './tab-bar'

describe('activeTab', () => {
  it('matches a tab and its nested routes', () => {
    expect(activeTab('/square')).toBe('/square')
    expect(activeTab('/square/clip-123')).toBe('/square')
    expect(activeTab('/me')).toBe('/me')
  })
  it('home (/stand) is a tab and matches only exactly, so its sub-pages do not light it up (2026-11-27 redesign)', () => {
    expect(activeTab('/stand')).toBe('/stand')
    expect(activeTab('/stand/wall')).toBeNull()
    expect(activeTab('/stand/trips/123')).toBeNull()
  })
  it('community is the hub; messages is a tab', () => {
    expect(activeTab('/stand/hub')).toBe('/stand/hub')
    expect(activeTab('/inbox')).toBe('/inbox')
  })
  it('does not match lookalike prefixes or other pages', () => {
    expect(activeTab('/meetings')).toBeNull()
    expect(activeTab('/')).toBeNull()
  })
})
