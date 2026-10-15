import { describe, expect, it } from 'vitest'
import { createProfileSchema } from './schema'

const ok = { teamId: 'mta', nick: 'יאיר', confirm: true, accept: true }

describe('createProfileSchema', () => {
  it('accepts a valid choice and trims the nickname', () => {
    const r = createProfileSchema.parse({ ...ok, nick: '  יאיר ' })
    expect(r.nick).toBe('יאיר')
  })
  it('rejects an unknown team, a short nickname and a missing confirmation', () => {
    expect(createProfileSchema.safeParse({ ...ok, teamId: 'xxx' }).success).toBe(false)
    expect(createProfileSchema.safeParse({ ...ok, nick: 'י' }).success).toBe(false)
    expect(createProfileSchema.safeParse({ ...ok, confirm: false }).success).toBe(false)
  })
  it('requires the age + terms + privacy consent as literal true', () => {
    expect(createProfileSchema.safeParse({ teamId: 'mta', nick: 'יאיר', confirm: true }).success).toBe(false)
    expect(createProfileSchema.safeParse({ ...ok, accept: false }).success).toBe(false)
    expect(createProfileSchema.safeParse({ ...ok, accept: 'true' }).success).toBe(false)
    expect(createProfileSchema.safeParse(ok).success).toBe(true)
  })
})
