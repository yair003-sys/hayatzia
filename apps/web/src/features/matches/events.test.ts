import { describe, expect, it } from 'vitest'
import { eventView, minuteText, playerMarks, timeline, type FixtureEvent } from './events'

const ev = (over: Partial<FixtureEvent>): FixtureEvent => ({
  m: 10, x: 0, team: 1, p: 'A. Player', as: '', type: 'Goal', det: 'Normal Goal', ...over,
})

describe('minuteText', () => {
  it('shows stoppage time as m+x', () => {
    expect(minuteText(90, 3)).toBe('90+3′')
    expect(minuteText(45, 0)).toBe('45′')
  })
})

describe('eventView', () => {
  it('labels goals in Hebrew, with the assist as a second line', () => {
    expect(eventView(ev({ as: 'B. Maker' }))).toEqual({ kind: 'goal', label: 'שער', player: 'A. Player', extra: 'בישול: B. Maker', minute: '10′', team: 1 })
    expect(eventView(ev({ det: 'Own Goal', as: 'ignored' }))).toMatchObject({ kind: 'own-goal', label: 'שער עצמי', extra: '' })
    expect(eventView(ev({ det: 'Penalty' }))).toMatchObject({ kind: 'penalty', label: 'שער בפנדל' })
    expect(eventView(ev({ det: 'Missed Penalty' }))).toMatchObject({ kind: 'missed-penalty', label: 'החמצת פנדל' })
  })

  it('labels cards; a second yellow is a red', () => {
    expect(eventView(ev({ type: 'Card', det: 'Yellow Card' }))).toMatchObject({ kind: 'yellow', label: 'כרטיס צהוב', player: 'A. Player' })
    expect(eventView(ev({ type: 'Card', det: 'Red Card' }))).toMatchObject({ kind: 'red', label: 'כרטיס אדום' })
    expect(eventView(ev({ type: 'Card', det: 'Second Yellow card' }))).toMatchObject({ kind: 'red', label: 'כרטיס אדום' })
  })

  it('reads a substitution as "assist came on for player" (provider: player = off, assist = on)', () => {
    expect(eventView(ev({ type: 'subst', det: 'Substitution 1', p: 'Off Guy', as: 'On Guy', m: 46 }))).toEqual({
      kind: 'sub', label: 'חילוף', player: 'On Guy', extra: 'במקום Off Guy', minute: '46′', team: 1,
    })
    expect(eventView(ev({ type: 'subst', det: 'Substitution 2', p: 'Off Guy', as: '' }))).toMatchObject({ player: 'Off Guy', extra: '' })
  })

  it('labels VAR decisions', () => {
    expect(eventView(ev({ type: 'Var', det: 'Goal cancelled' }))).toMatchObject({ kind: 'var', label: 'VAR · השער נפסל' })
    expect(eventView(ev({ type: 'Var', det: 'Goal confirmed' }))).toMatchObject({ kind: 'var', label: 'VAR · השער אושר' })
    expect(eventView(ev({ type: 'Var', det: 'Penalty confirmed' }))).toMatchObject({ kind: 'var', label: 'VAR · הפנדל אושר' })
    expect(eventView(ev({ type: 'Var', det: 'Card upgrade' }))).toMatchObject({ kind: 'var', label: 'VAR · הכרטיס הוחמר' })
    expect(eventView(ev({ type: 'Var', det: 'Something new' }))).toMatchObject({ kind: 'var', label: 'VAR' })
  })

  it('never crashes on an unknown event type', () => {
    expect(eventView(ev({ type: 'Weird', det: '' }))).toMatchObject({ kind: 'other', label: 'אירוע' })
  })
})

describe('timeline', () => {
  it('lists the newest event first, stoppage time after the regular minute', () => {
    const list = timeline([
      ev({ m: 12, p: 'first' }),
      ev({ m: 90, x: 2, p: 'late' }),
      ev({ m: 90, x: 0, p: 'ninety' }),
      ev({ m: 45, x: 1, p: 'ht' }),
    ])
    expect(list.map((e) => e.player)).toEqual(['late', 'ninety', 'ht', 'first'])
  })

  it('keeps the provider order reversed for events in the same minute, with stable keys', () => {
    const list = timeline([ev({ m: 60, p: 'a' }), ev({ m: 60, p: 'b' })])
    expect(list.map((e) => e.player)).toEqual(['b', 'a'])
    expect(new Set(list.map((e) => e.key)).size).toBe(2)
  })

  it('handles an empty list', () => {
    expect(timeline([])).toEqual([])
  })
})

describe('playerMarks', () => {
  it('counts goals per player but not own goals or missed penalties', () => {
    const marks = playerMarks(
      [
        ev({ p: 'Zahavi', type: 'Goal', det: 'Normal Goal' }),
        ev({ p: 'Zahavi', type: 'Goal', det: 'Penalty' }),
        ev({ p: 'Zahavi', type: 'Goal', det: 'Missed Penalty' }),
        ev({ p: 'Own', type: 'Goal', det: 'Own Goal' }),
      ],
      1,
    )
    expect(marks.get('Zahavi')?.goals).toBe(2)
    expect(marks.has('Own')).toBe(false)
  })

  it('marks yellow, red and subbed-off, and ignores the other team', () => {
    const marks = playerMarks(
      [
        ev({ p: 'Booked', type: 'Card', det: 'Yellow Card' }),
        ev({ p: 'Sent', type: 'Card', det: 'Red Card' }),
        ev({ p: 'OffGuy', type: 'subst', as: 'OnGuy' }),
        ev({ p: 'Other', team: 2, type: 'Card', det: 'Yellow Card' }),
      ],
      1,
    )
    expect(marks.get('Booked')).toMatchObject({ yellow: true, red: false })
    expect(marks.get('Sent')).toMatchObject({ red: true })
    expect(marks.get('OffGuy')?.off).toBe(true)
    expect(marks.has('Other')).toBe(false)
  })
})
