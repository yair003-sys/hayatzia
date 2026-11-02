import { describe, expect, it } from 'vitest'
import { NEUTRAL_TEAM, TEAMS, isNeutralTeam, isTeamId, teamById } from './data'

describe('TEAMS', () => {
  it('has the 14 Ligat Ha\'Al clubs with unique ids', () => {
    expect(TEAMS).toHaveLength(14)
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(14)
  })
  it('uses valid hex colours', () => {
    for (const t of [...TEAMS, NEUTRAL_TEAM]) for (const c of [t.bg, t.ring, t.bar]) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('looks teams up by id', () => {
    expect(teamById('mta')?.name).toBe('מכבי תל אביב')
    expect(teamById('nope')).toBeUndefined()
    expect(isTeamId('snk')).toBe(true)
    expect(isTeamId('xyz')).toBe(false)
  })
})

describe('neutral staff team', () => {
  it('resolves for branding but is NOT a selectable club', () => {
    expect(teamById('onefan')).toEqual(NEUTRAL_TEAM)
    expect(isTeamId('onefan')).toBe(true)
    expect(isNeutralTeam('onefan')).toBe(true)
    expect(isNeutralTeam('mta')).toBe(false)
    // the sign-up picker iterates TEAMS, which must never include the neutral team
    expect(TEAMS.some((t) => t.id === 'onefan')).toBe(false)
  })
})
