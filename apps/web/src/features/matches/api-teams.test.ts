import { describe, expect, it } from 'vitest'
import { displayTeam, groupLabelHe, roundLabelHe } from './api-teams'

describe('displayTeam', () => {
  it('maps a known club to our team with colours', () => {
    const t = displayTeam(604, 'Maccabi Tel Aviv')
    expect(t.local).toBe(true)
    expect(t.id).toBe('mta')
    expect(t.bg).toBe('#FFD400')
  })
  it('maps the old Katamon name to Hapoel Jerusalem', () => {
    expect(displayTeam(1, 'Hapoel Katamon').id).toBe('hjr')
  })
  it('gives past-season clubs a Hebrew name and neutral colours', () => {
    const t = displayTeam(4481, 'Hapoel Hadera')
    expect(t.local).toBe(false)
    expect(t.name).toBe('הפועל חדרה')
    expect(t.id).toBe('api-4481')
  })
  it('never crashes on an unknown or missing name', () => {
    expect(displayTeam(9, undefined).name).toBe('קבוצה')
    expect(displayTeam(9, 'Some FC').name).toBe('Some FC')
  })
})

describe('round and group labels', () => {
  it('translates rounds', () => {
    expect(roundLabelHe('Regular Season - 7')).toBe('מחזור 7')
    expect(roundLabelHe('Championship Round - 2')).toBe('פלייאוף עליון · מחזור 2')
    expect(roundLabelHe('Relegation Round - 3')).toBe('פלייאוף תחתון · מחזור 3')
  })
  it('translates standings groups', () => {
    expect(groupLabelHe("Ligat Ha'al: Championship Round")).toBe('פלייאוף עליון')
    expect(groupLabelHe("Ligat Ha'al")).toBe('עונה סדירה')
  })
})
