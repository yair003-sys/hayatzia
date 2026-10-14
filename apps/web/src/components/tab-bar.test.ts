import { describe, expect, it } from 'vitest'
import { activeTab } from './tab-bar'

describe('activeTab', () => {
  it('matches a tab and its nested routes', () => {
    expect(activeTab('/square')).toBe('/square')
    expect(activeTab('/matches/123')).toBe('/matches')
  })
  it('the fans\' chat is a tab; the home is not (the logo in the top bar leads there)', () => {
    expect(activeTab('/stand/chat')).toBe('/stand/chat')
    expect(activeTab('/stand')).toBeNull()
  })
  it('does not match lookalike prefixes or other pages', () => {
    expect(activeTab('/meetings')).toBeNull()
    expect(activeTab('/')).toBeNull()
  })
})
