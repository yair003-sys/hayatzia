import { describe, expect, it } from 'vitest'
import { TEAMS, isTeamId, teamById } from './data'

describe('TEAMS', () => {
  it('has the 14 Ligat Ha\'Al clubs with unique ids', () => {
    expect(TEAMS).toHaveLength(14)
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(14)
  })
  it('uses valid hex colours', () => {
    for (const t of TEAMS) for (const c of [t.bg, t.ring, t.bar]) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('looks teams up by id', () => {
    expect(teamById('mta')?.name).toBe('מכבי תל אביב')
    expect(teamById('nope')).toBeUndefined()
    expect(isTeamId('snk')).toBe(true)
    expect(isTeamId('xyz')).toBe(false)
  })
})
