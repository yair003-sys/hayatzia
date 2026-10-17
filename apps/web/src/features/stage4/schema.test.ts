import { describe, expect, it } from 'vitest'
import { chantSchema, checkinErrorHe, motmRanking, motmSquad, ratingsSchema } from './schema'

describe('check-in errors', () => {
  it('explain why in plain Hebrew', () => {
    expect(checkinErrorHe('too_far')).toBe('אתה לא באצטדיון. הצ׳ק-אין עובד רק עד 500 מטר ממנו')
    expect(checkinErrorHe('not_open')).toBe('הצ׳ק-אין פתוח מחצי שעה לפני המשחק ועד שעה אחרי הסיום')
    expect(checkinErrorHe('no_venue')).toBe('אין לנו את מיקום האצטדיון הזה')
    expect(checkinErrorHe('denied')).toBe('צריך לאשר גישה למיקום כדי לעשות צ׳ק-אין')
  })
})

describe('motmRanking', () => {
  it('sorts by average, then by number of ratings', () => {
    const r = motmRanking([
      { player_id: 'a', sum: 16, count: 2 },
      { player_id: 'b', sum: 27, count: 3 },
      { player_id: 'c', sum: 9, count: 1 },
    ])
    expect(r.map((x) => [x.playerId, x.avg])).toEqual([
      ['b', 9],
      ['c', 9],
      ['a', 8],
    ])
  })
  it('rounds the average to one decimal', () => {
    expect(motmRanking([{ player_id: 'a', sum: 25, count: 3 }])[0]!.avg).toBe(8.3)
  })
})

describe('ratingsSchema', () => {
  it('takes 1–10 for some players', () => {
    expect(ratingsSchema.safeParse({ fixtureId: 1, ratings: [{ playerId: 'mta_9', score: 10 }] }).success).toBe(true)
    expect(ratingsSchema.safeParse({ fixtureId: 1, ratings: [{ playerId: 'mta_9', score: 0 }] }).success).toBe(false)
    expect(ratingsSchema.safeParse({ fixtureId: 1, ratings: [] }).success).toBe(false)
  })
})

describe('chantSchema', () => {
  it('needs a title, lyrics up to 2000', () => {
    expect(chantSchema.safeParse({ title: 'הצהובים עולים', lyrics: 'אולה' }).success).toBe(true)
    expect(chantSchema.safeParse({ title: ' ', lyrics: '' }).success).toBe(false)
  })
})

describe('motmSquad (from the shared, cached club squad)', () => {
  it('numbered players only, the sample XI first, then by number; the shared array is untouched', () => {
    const squad = Object.freeze([
      Object.freeze({ id: 'b', number: 7, in_xi: false }),
      Object.freeze({ id: 'c', number: null, in_xi: true }),
      Object.freeze({ id: 'a', number: 9, in_xi: true }),
      Object.freeze({ id: 'd', number: 1, in_xi: true }),
      Object.freeze({ id: 'e', number: 3, in_xi: false }),
    ])
    expect(motmSquad(squad).map((p) => p.id)).toEqual(['d', 'a', 'e', 'b'])
    expect(squad.map((p) => p.id)).toEqual(['b', 'c', 'a', 'd', 'e'])
  })
})
