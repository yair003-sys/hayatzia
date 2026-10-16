import { describe, expect, it } from 'vitest'
import { addDays, birthDateCode, birthDateErrorHe, birthDateOf, birthDateSchema, isRealDate, todayIso, yearsBefore } from './schema'

const ok = (v: string) => birthDateSchema.safeParse(v).success
const why = (v: string) => birthDateSchema.safeParse(v).error?.issues[0]?.message

describe('birthDateSchema (sign-up from 16, owner 2026-10-16)', () => {
  it('16 years ago today passes; one day short fails with the Hebrew reason', () => {
    const sixteen = yearsBefore(todayIso(), 16)
    expect(ok(sixteen)).toBe(true)
    expect(ok(addDays(sixteen, 1))).toBe(false)
    expect(why(addDays(sixteen, 1))).toBe('ההרשמה מגיל 16')
    expect(ok('1990-05-01')).toBe(true)
  })

  it('refuses dates before 1900, in the future, unreal or empty', () => {
    expect(ok('1899-12-31')).toBe(false)
    expect(ok('1900-01-01')).toBe(true)
    expect(ok(addDays(todayIso(), 1))).toBe(false)
    expect(why(addDays(todayIso(), 1))).toBe('התאריך לא תקין. בדוק את היום, החודש והשנה')
    expect(ok('1990-02-30')).toBe(false)
    expect(ok('')).toBe(false)
    expect(why('')).toBe('צריך למלא תאריך לידה')
  })
})

describe('birth-date helpers', () => {
  it('maps the database codes to Hebrew', () => {
    expect(birthDateErrorHe('too_young')).toBe('ההרשמה מגיל 16')
    expect(birthDateErrorHe('already_set')).toBe('תאריך הלידה כבר נשמר')
    expect(birthDateErrorHe('???')).toBe('השמירה נכשלה. נסה שוב')
    expect(birthDateCode('ERROR: too_young')).toBe('too_young')
    expect(birthDateCode('something')).toBe('')
  })

  it('builds the date from the three fields', () => {
    expect(birthDateOf('1', '5', '1990')).toBe('1990-05-01')
    expect(birthDateOf('', '5', '1990')).toBe('')
  })

  it('handles 29 February and real dates', () => {
    expect(yearsBefore('2028-02-29', 16)).toBe('2012-02-29')
    expect(yearsBefore('2028-02-29', 1)).toBe('2027-02-28')
    expect(isRealDate('2024-02-29')).toBe(true)
    expect(isRealDate('2023-02-29')).toBe(false)
    expect(todayIso(new Date('2026-10-16T22:30:00Z'))).toBe('2026-10-17') // Israel is ahead of UTC
  })
})
