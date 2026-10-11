import { describe, expect, it } from 'vitest'
import { createProfileSchema } from './schema'

describe('createProfileSchema', () => {
  it('accepts a valid choice and trims the nickname', () => {
    const r = createProfileSchema.parse({ teamId: 'mta', nick: '  יאיר ', confirm: true })
    expect(r.nick).toBe('יאיר')
  })
  it('rejects an unknown team, a short nickname and a missing confirmation', () => {
    expect(createProfileSchema.safeParse({ teamId: 'xxx', nick: 'יאיר', confirm: true }).success).toBe(false)
    expect(createProfileSchema.safeParse({ teamId: 'mta', nick: 'י', confirm: true }).success).toBe(false)
    expect(createProfileSchema.safeParse({ teamId: 'mta', nick: 'יאיר', confirm: false }).success).toBe(false)
  })
})
