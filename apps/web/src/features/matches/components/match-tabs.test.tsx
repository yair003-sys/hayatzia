import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MatchTabs } from './match-tabs'

const startUrl = window.location.href

afterEach(() => {
  cleanup()
  // The tabs rewrite ?tab= with replaceState: put the address back so other tests start clean.
  window.history.replaceState(null, '', startUrl)
})

describe('MatchTabs', () => {
  it('shows the initial tab, keeps the others mounted but hidden, and syncs ?tab=', () => {
    render(<MatchTabs initial="room" game={<p>game body</p>} lineup={<p>lineup body</p>} room={<p>room body</p>} />)
    expect(screen.getByText('room body')).toBeVisible()
    expect(screen.getByText('game body')).not.toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'משחק' }))
    expect(screen.getByText('game body')).toBeVisible()
    expect(screen.getByText('room body')).not.toBeVisible()
    expect(window.location.search).toBe('?tab=game')
  })
})
