import { describe, expect, it } from 'vitest'
import { activeTab } from './tab-bar'

describe('activeTab', () => {
  it('matches a tab and its nested routes', () => {
    expect(activeTab('/square')).toBe('/square')
    expect(activeTab('/matches/123')).toBe('/matches')
  })
  it('does not match lookalike prefixes or other pages', () => {
    expect(activeTab('/meetings')).toBeNull()
    expect(activeTab('/')).toBeNull()
  })
})
