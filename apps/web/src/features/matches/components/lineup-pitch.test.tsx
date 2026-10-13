import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LineupPitch, type PitchSide } from './lineup-pitch'
import { MatchTabs } from './match-tabs'

const team = (short: string) => ({ name: `${short} FC`, short, bg: '#000000', ring: '#ffffff' })
const xi = (grid: (string | null)[]) => grid.map((g, i) => ({ n: i + 1, p: `P. Player${i + 1}`, pos: i === 0 ? 'G' : 'D', g }))
const lu = (grid: (string | null)[]) => ({ team: 1, f: '4-4-2', coach: 'Coach One', xi: xi(grid), sub: [{ n: 12, p: 'Bench Guy', pos: 'M' }] })

afterEach(() => {
  cleanup()
})

describe('LineupPitch', () => {
  it('says the line-ups are not out yet when there are none', () => {
    render(<LineupPitch sides={[{ key: 'home', team: team('ביתית'), lu: null }, { key: 'away', team: team('אורחת'), lu: null }]} />)
    expect(screen.getByText('ההרכבים יפורסמו לפני המשחק')).toBeInTheDocument()
  })

  it('draws the XI on the pitch with formation, coach and bench', () => {
    const sides: PitchSide[] = [
      { key: 'home', team: team('ביתית'), lu: lu(['1:1', '2:1', '2:2']) },
      { key: 'away', team: team('אורחת'), lu: null },
    ]
    render(<LineupPitch sides={sides} />)
    expect(screen.getByRole('img', { name: /ההרכב הפותח/ })).toBeInTheDocument()
    expect(screen.getByText('Player1')).toBeInTheDocument()
    expect(screen.getByText('Coach One')).toBeInTheDocument()
    expect(screen.getByText('Bench Guy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /אורחת/ }))
    expect(screen.getByText('ההרכבים יפורסמו לפני המשחק')).toBeInTheDocument()
  })

  it('falls back to a list when a grid entry is missing, never crashes', () => {
    render(<LineupPitch sides={[{ key: 'home', team: team('ביתית'), lu: lu(['1:1', null]) }, { key: 'away', team: team('אורחת'), lu: null }]} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('הרכב פותח')).toBeInTheDocument()
    expect(screen.getByText('P. Player2')).toBeInTheDocument()
  })
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
