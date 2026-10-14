import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultSideKey, LineupPitch, type PitchSide } from './lineup-pitch'

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

  it('opens on the side that has a line-up', () => {
    render(<LineupPitch sides={[{ key: 'home', team: team('ביתית'), lu: null }, { key: 'away', team: team('אורחת'), lu: lu(['1:1', '2:1']) }]} />)
    expect(screen.getByRole('button', { name: /אורחת/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Coach One')).toBeInTheDocument()
  })

  it('reads the XI out to screen readers as a list', () => {
    render(<LineupPitch sides={[{ key: 'home', team: team('ביתית'), lu: lu(['1:1', '2:1']) }, { key: 'away', team: team('אורחת'), lu: null }]} />)
    const list = screen.getByRole('list', { name: /שחקני ההרכב הפותח של ביתית FC/ })
    expect(list).toHaveTextContent('1, P. Player1, שוער')
    expect(list).toHaveTextContent('2, P. Player2, הגנה')
  })
})

describe('defaultSideKey', () => {
  const side = (key: 'home' | 'away', has: boolean): PitchSide => ({ key, team: team(key), lu: has ? lu(['1:1']) : null })
  it('is the first side with a line-up, home when neither or both have one', () => {
    expect(defaultSideKey([side('home', false), side('away', true)])).toBe('away')
    expect(defaultSideKey([side('home', true), side('away', true)])).toBe('home')
    expect(defaultSideKey([side('home', false), side('away', false)])).toBe('home')
  })
  it('skips a side whose line-up is empty', () => {
    const empty: PitchSide = { key: 'home', team: team('h'), lu: { ...lu([]), sub: [] } }
    expect(defaultSideKey([empty, side('away', true)])).toBe('away')
  })
})
