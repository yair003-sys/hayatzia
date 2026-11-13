import { describe, expect, it } from 'vitest'
import { activeTab } from './tab-bar'

describe('activeTab', () => {
  it('matches a tab and its nested routes', () => {
    expect(activeTab('/square')).toBe('/square')
    expect(activeTab('/stand/trips/123')).toBe('/stand/trips')
  })
  it('messages is a tab; the home and the club chat are not (the chat merged into messages, 2026-11-14)', () => {
    expect(activeTab('/inbox')).toBe('/inbox')
    expect(activeTab('/stand/chat')).toBeNull()
    expect(activeTab('/stand')).toBeNull()
  })
  it('does not match lookalike prefixes or other pages', () => {
    expect(activeTab('/meetings')).toBeNull()
    expect(activeTab('/')).toBeNull()
  })
})
