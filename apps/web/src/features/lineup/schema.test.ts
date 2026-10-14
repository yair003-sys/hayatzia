import { describe, expect, it } from 'vitest'
import {
  canBuild,
  lineupPhase,
  checkXI,
  emptyXI,
  fansXI,
  FORMATIONS,
  formationSlots,
  isFormation,
  lineupErrorHe,
  parseFormations,
  placeAt,
  roleOf,
  saveLineupSchema,
  swapSlots,
  clearSlot,
  toPayload,
  topFormation,
  xiFromSaved,
  type Tally,
} from './schema'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `mta_${i + 1}`)
const full = () => ids(11)

describe('formationSlots', () => {
  it('gives 11 slots for every formation, goalkeeper in slot 0 at the bottom', () => {
    for (const f of FORMATIONS) {
      const s = formationSlots(f)
      expect(s).toHaveLength(11)
      expect(s.map((x) => x.slot)).toEqual([...Array(11).keys()])
      expect(s[0]).toMatchObject({ role: 'GK', x: 50, y: 8 })
      for (const x of s) {
        expect(x.x).toBeGreaterThan(8)
        expect(x.x).toBeLessThan(92)
        expect(x.y).toBeGreaterThanOrEqual(8)
        expect(x.y).toBeLessThanOrEqual(88)
      }
    }
  })

  it('lays the lines out from defence (low) to attack (high)', () => {
    const s = formationSlots('4-3-3')
    expect(s.map((x) => x.role)).toEqual(['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'])
    expect(s[1]!.y).toBeLessThan(s[5]!.y)
    expect(s[5]!.y).toBeLessThan(s[8]!.y)
    expect(s.slice(1, 5).map((x) => x.x)).toEqual([18.5, 39.5, 60.5, 81.5])
  })

  it('treats both middle lines of 4-2-3-1 as midfield and the last as attack', () => {
    const roles = formationSlots('4-2-3-1').map((x) => x.role)
    expect(roles.filter((r) => r === 'DEF')).toHaveLength(4)
    expect(roles.filter((r) => r === 'MID')).toHaveLength(5)
    expect(roles.filter((r) => r === 'FWD')).toHaveLength(1)
    expect(formationSlots('5-3-2').filter((x) => x.role === 'DEF')).toHaveLength(5)
    expect(formationSlots('3-5-2').filter((x) => x.role === 'MID')).toHaveLength(5)
  })
})

describe('isFormation / parseFormations', () => {
  it('knows the five formations only', () => {
    expect(isFormation('4-3-3')).toBe(true)
    expect(isFormation('4-5-1')).toBe(false)
    expect(isFormation(7)).toBe(false)
  })
  it('reads the totals map, dropping junk', () => {
    expect(parseFormations({ '4-3-3': 3, '4-4-2': 1 })).toEqual({ '4-3-3': 3, '4-4-2': 1 })
    expect(parseFormations({ '4-3-3': 'x', '9-9-9': 2, '3-5-2': 0 })).toEqual({})
    expect(parseFormations(null)).toEqual({})
    expect(parseFormations([1, 2])).toEqual({})
  })
})

describe('topFormation', () => {
  it('is the most chosen formation, FORMATIONS order on a tie, null when empty', () => {
    expect(topFormation({ '4-4-2': 3, '3-5-2': 5 })).toEqual({ formation: '3-5-2', count: 5 })
    expect(topFormation({ '5-3-2': 2, '4-4-2': 2 })).toEqual({ formation: '4-4-2', count: 2 })
    expect(topFormation({})).toBeNull()
  })
})

describe('fansXI', () => {
  const t = (formation: string, slot: number, player: string, picks: number): Tally => ({ formation, slot, player_id: player, picks })

  it('is null when nobody saved a lineup', () => {
    expect(fansXI([], null)).toBeNull()
    expect(fansXI([], { fans: 0, formations: {} })).toBeNull()
  })

  it('uses the most-picked formation and the top player per slot, with picks / fans as the percent', () => {
    const r = fansXI(
      [t('4-3-3', 0, 'a', 6), t('4-3-3', 0, 'b', 2), t('4-4-2', 0, 'c', 9), t('4-3-3', 9, 'd', 5)],
      { fans: 10, formations: { '4-3-3': 8, '4-4-2': 2 } },
    )
    expect(r?.formation).toBe('4-3-3')
    expect(r?.fans).toBe(10)
    expect(r?.formationPct).toBe(80)
    expect(r?.slots[0]).toEqual({ slot: 0, playerId: 'a', picks: 6, pct: 60 })
    expect(r?.slots[9]).toEqual({ slot: 9, playerId: 'd', picks: 5, pct: 50 })
    expect(r?.slots[1]).toBeNull()
    expect(r?.slots).toHaveLength(11)
  })

  it('never puts one player in two slots: greedy by picks, the runner-up fills the other slot', () => {
    // "s" is the favourite in slot 9 (7) and also picked in slot 10 (5); slot 10's own best is "w" (4).
    const r = fansXI([t('4-3-3', 9, 's', 7), t('4-3-3', 10, 's', 5), t('4-3-3', 10, 'w', 4), t('4-3-3', 10, 'z', 1)], {
      fans: 12,
      formations: { '4-3-3': 12 },
    })
    expect(r?.slots[9]?.playerId).toBe('s')
    expect(r?.slots[10]?.playerId).toBe('w')
    const used = r!.slots.filter((x) => x !== null).map((x) => x.playerId)
    expect(new Set(used).size).toBe(used.length)
  })

  it('gives the slot to the higher count when a player is wanted in two slots', () => {
    const r = fansXI([t('4-3-3', 5, 'm', 3), t('4-3-3', 6, 'm', 8), t('4-3-3', 5, 'n', 2)], { fans: 9, formations: { '4-3-3': 9 } })
    expect(r?.slots[6]?.playerId).toBe('m')
    expect(r?.slots[5]?.playerId).toBe('n')
  })

  it('breaks ties deterministically (formation order, then slot, then player id)', () => {
    const r = fansXI([t('4-4-2', 1, 'b', 2), t('4-4-2', 1, 'a', 2)], { fans: 4, formations: { '4-4-2': 2, '4-3-3': 2 } })
    expect(r?.formation).toBe('4-3-3')
    const r2 = fansXI([t('4-4-2', 1, 'b', 2), t('4-4-2', 1, 'a', 2)], { fans: 4, formations: { '4-4-2': 2 } })
    expect(r2?.slots[1]?.playerId).toBe('a')
  })

  it('skips players who are no longer in the squad and unknown formations', () => {
    const r = fansXI([t('4-3-3', 0, 'gone', 9), t('4-3-3', 0, 'here', 1)], { fans: 9, formations: { '4-3-3': 9, '9-9-9': 99 } }, new Set(['here']))
    expect(r?.formation).toBe('4-3-3')
    expect(r?.slots[0]?.playerId).toBe('here')
  })
})

describe('builder moves', () => {
  it('places a bench player in an empty slot', () => {
    const xi = placeAt(emptyXI(), 3, 'p')
    expect(xi[3]).toBe('p')
    expect(xi.filter(Boolean)).toHaveLength(1)
  })
  it('a bench player dropped on a filled slot sends the old one to the bench', () => {
    const xi = placeAt(placeAt(emptyXI(), 3, 'p'), 3, 'q')
    expect(xi[3]).toBe('q')
    expect(xi).not.toContain('p')
  })
  it('a pitch player dropped on another slot swaps the two', () => {
    let xi = placeAt(placeAt(emptyXI(), 1, 'a'), 2, 'b')
    xi = placeAt(xi, 2, 'a')
    expect([xi[1], xi[2]]).toEqual(['b', 'a'])
    expect(swapSlots(xi, 1, 2).slice(1, 3)).toEqual(['a', 'b'])
    expect(placeAt(xi, 5, 'a')[1]).toBe('b')
    expect(placeAt(xi, 5, 'a')[2]).toBeNull()
  })
  it('clears a slot (back to the bench) without touching the rest', () => {
    const xi = clearSlot(placeAt(placeAt(emptyXI(), 1, 'a'), 2, 'b'), 1)
    expect([xi[1], xi[2]]).toEqual([null, 'b'])
  })
  it('does not mutate the input', () => {
    const a = emptyXI()
    placeAt(a, 0, 'x')
    expect(a[0]).toBeNull()
  })
})

describe('checkXI', () => {
  const squad = new Set(ids(14))
  it('accepts 11 different players of the squad', () => {
    expect(checkXI(full(), squad)).toBeNull()
  })
  it('names what is wrong', () => {
    expect(checkXI([...full().slice(0, 10), null], squad)).toBe('incomplete')
    expect(checkXI([...full().slice(0, 10), 'mta_1'], squad)).toBe('duplicate')
    expect(checkXI([...full().slice(0, 10), 'hta_1'], squad)).toBe('unknown')
    expect(checkXI(full().slice(0, 10), squad)).toBe('incomplete')
  })
})

describe('payload and saved slots', () => {
  it('round-trips through the database shape', () => {
    const p = toPayload(full())
    expect(p[0]).toEqual({ slot: 0, playerId: 'mta_1' })
    const saved = p.map((x) => ({ slot: x.slot, player_id: x.playerId })).reverse()
    expect(xiFromSaved(saved)).toEqual(full())
  })
  it('reads a broken saved value as an empty XI', () => {
    expect(xiFromSaved('nope')).toEqual(emptyXI())
    expect(xiFromSaved([{ slot: 99, player_id: 'x' }, { slot: 2 }])).toEqual(emptyXI())
  })
})

describe('saveLineupSchema', () => {
  const slots = toPayload(full())
  it('takes a known formation and exactly 11 slots', () => {
    expect(saveLineupSchema.safeParse({ fixtureId: 5, formation: '4-3-3', slots }).success).toBe(true)
    // Loose id shape only: the database checks that each id is a player of the fan's club.
    expect(saveLineupSchema.safeParse({ fixtureId: 5, formation: '4-3-3', slots: slots.map((x, i) => ({ ...x, playerId: `club9_p${i}` })) }).success).toBe(true)
    expect(saveLineupSchema.safeParse({ fixtureId: 5, formation: '4-3-3', slots: slots.map((x) => ({ ...x, playerId: 'DROP TABLE' })) }).success).toBe(false)
    expect(saveLineupSchema.safeParse({ fixtureId: 5, formation: '4-5-1', slots }).success).toBe(false)
    expect(saveLineupSchema.safeParse({ fixtureId: 5, formation: '4-3-3', slots: slots.slice(1) }).success).toBe(false)
    expect(saveLineupSchema.safeParse({ fixtureId: 5, formation: '4-3-3', slots: [...slots.slice(1), { slot: 11, playerId: 'mta_1' }] }).success).toBe(false)
  })
})

describe('roleOf', () => {
  it('maps the squad positions, including the long codes, and leaves the coach out', () => {
    expect(roleOf('GK')).toBe('GK')
    expect(roleOf('CB')).toBe('DEF')
    expect(roleOf('DF')).toBe('DEF')
    expect(roleOf('CDM')).toBe('MID')
    expect(roleOf('MF')).toBe('MID')
    expect(roleOf('LW')).toBe('FWD')
    expect(roleOf('FW')).toBe('FWD')
    expect(roleOf('מאמן')).toBeNull()
  })
})

describe('lineupErrorHe', () => {
  it('explains each database refusal in Hebrew', () => {
    expect(lineupErrorHe('locked')).toBe('ההרכב ננעל — המשחק כבר התחיל')
    expect(lineupErrorHe('not_your_match')).toBe('אפשר לבנות הרכב רק למשחק של הקבוצה שלך')
    expect(lineupErrorHe('not_your_player')).toBe('אפשר לבחור רק שחקנים של הקבוצה שלך')
    expect(lineupErrorHe('bad_players')).toBe('כל שחקן יכול להופיע בהרכב פעם אחת')
    expect(lineupErrorHe('bad_slots')).toBe('צריך 11 שחקנים בהרכב')
    expect(lineupErrorHe('bad_formation')).toBe('המערך הזה לא מוכר. בחר מערך מהרשימה')
    expect(lineupErrorHe('no such match')).toBe('המשחק לא נמצא')
    expect(lineupErrorHe('not signed in')).toBe('צריך להתחבר כדי לשמור הרכב')
    expect(lineupErrorHe('no profile')).toBe('צריך להתחבר כדי לשמור הרכב')
    expect(lineupErrorHe('boom')).toBe('ההרכב לא נשמר. נסה שוב')
  })
})

describe('canBuild / lineupPhase', () => {
  const now = 1_800_000_000_000
  const at = (mins: number) => now / 1000 + mins * 60
  it('is open only before kick-off of a match that has not started', () => {
    expect(canBuild({ t: at(30), st: 'NS' }, now)).toBe(true)
    expect(canBuild({ t: at(30), st: 'TBD' }, now)).toBe(true)
    expect(canBuild({ t: at(0), st: 'NS' }, now)).toBe(false)
    expect(canBuild({ t: at(30), st: 'PST' }, now)).toBe(false)
    expect(canBuild({ t: at(-5), st: '1H' }, now)).toBe(false)
  })
  it('is locked while it is played and done after the final whistle', () => {
    expect(lineupPhase({ t: at(30), st: 'NS' }, now)).toBe('open')
    expect(lineupPhase({ t: at(-5), st: '1H' }, now)).toBe('locked')
    expect(lineupPhase({ t: at(-5), st: 'NS' }, now)).toBe('locked')
    expect(lineupPhase({ t: at(-120), st: 'FT' }, now)).toBe('done')
  })
  it('is off (not "locked by the whistle") for a postponed, cancelled or abandoned match', () => {
    expect(lineupPhase({ t: at(30), st: 'PST' }, now)).toBe('off')
    expect(lineupPhase({ t: at(-30), st: 'CANC' }, now)).toBe('off')
    expect(lineupPhase({ t: at(-30), st: 'ABD' }, now)).toBe('off')
    expect(lineupPhase({ t: at(-30), st: 'TBD' }, now)).toBe('off')
  })
})
