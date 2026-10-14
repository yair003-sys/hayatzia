import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { FansXI, Role, SquadPlayer } from '../schema'
import { FanLineup } from './fan-lineup'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../server/actions', () => ({ saveFanLineupAction: vi.fn() }))

const ROLES: Role[] = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'MID']
const squad: SquadPlayer[] = ROLES.map((role, i) => ({ id: `mta_${i + 1}`, number: i + 1, name: `שחקן ${i + 1}`, short: `ש${i + 1}`, role, injured: false }))
const team = { name: 'מכבי תל אביב', short: 'מכבי ת״א', bg: '#FFD400', ring: '#1D3FA8' }
const xi = squad.slice(0, 11).map((p) => p.id)
const fans: FansXI = {
  formation: '4-3-3',
  fans: 10,
  formationPct: 80,
  slots: xi.map((playerId, slot) => (slot === 4 ? null : { slot, playerId, picks: 6, pct: 60 })),
}

beforeEach(() => {
  window.history.replaceState(null, '', '/matches/7?tab=lineup')
  refresh.mockClear()
})
afterEach(() => {
  cleanup()
})

describe('FanLineup (match page, הרכב tab)', () => {
  it('before kick-off: the fans’ XI with percent per slot, how many chose, and a build button', () => {
    render(<FanLineup fixtureId={7} team={team} phase="open" squad={squad} mine={null} fans={fans} ratings={null} />)
    expect(screen.getByRole('button', { name: 'ההרכב של האוהדים' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('10 אוהדים בחרו')).toBeInTheDocument()
    expect(screen.getAllByText('60%')).toHaveLength(10)
    expect(screen.getByRole('img', { name: 'ההרכב של אוהדי מכבי תל אביב' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ההרכב שלי' }))
    expect(screen.getByText('עוד לא בנית הרכב למשחק הזה')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'בנה את ההרכב שלך' }))
    expect(screen.getByRole('dialog', { name: /ההרכב שלי/ })).toBeInTheDocument()
  })

  it('with no saves yet invites the first fan', () => {
    render(<FanLineup fixtureId={7} team={team} phase="open" squad={squad} mine={null} fans={null} ratings={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'ההרכב של האוהדים' }))
    expect(screen.getByText('עוד אף אוהד לא בחר הרכב. תהיה הראשון')).toBeInTheDocument()
  })

  it('edits a saved lineup, saves, closes and refreshes the counts', async () => {
    const save = vi.fn(async () => ({ ok: true as const }))
    render(<FanLineup fixtureId={7} team={team} phase="open" squad={squad} mine={{ formation: '4-3-3', xi }} fans={fans} ratings={null} save={save} />)
    fireEvent.click(screen.getByRole('button', { name: 'ערוך את ההרכב שלי' }))
    fireEvent.click(screen.getByRole('button', { name: '4-4-2' }))
    fireEvent.click(screen.getByRole('button', { name: 'שמור את ההרכב שלי' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ fixtureId: 7, formation: '4-4-2' }))
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'ההרכב שלי' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('4-4-2')).toBeInTheDocument()
  })

  it('after kick-off: locked, still showing the fans’ XI, no build button', () => {
    render(<FanLineup fixtureId={7} team={team} phase="locked" squad={squad} mine={null} fans={fans} ratings={null} />)
    expect(screen.getByText('ננעל בשריקת הפתיחה')).toBeInTheDocument()
    expect(screen.getAllByText('60%')).toHaveLength(10)
    expect(screen.queryByRole('button', { name: /בנה את ההרכב|ערוך/ })).toBeNull()
  })

  it('after the match: each player carries the fans’ average rating', () => {
    render(
      <FanLineup fixtureId={7} team={team} phase="done" squad={squad} mine={{ formation: '4-3-3', xi }} fans={null} ratings={{ mta_1: 7.5, mta_9: 8 }} />,
    )
    expect(screen.getByText('★ 7.5')).toBeInTheDocument()
    expect(screen.getByText('★ 8.0')).toBeInTheDocument()
    expect(screen.getByText(/ממוצע הדירוג של האוהדים/)).toBeInTheDocument()
  })

  it('shows nothing after kick-off when nobody built a lineup', () => {
    const { container } = render(<FanLineup fixtureId={7} team={team} phase="locked" squad={squad} mine={null} fans={null} ratings={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
