import { describe, expect, it } from 'vitest'
import { SUPABASE_REFS, assertEnvironmentSeparation } from './env'

const prodUrl = `https://${SUPABASE_REFS.production}.supabase.co`
const stagingUrl = `https://${SUPABASE_REFS.staging}.supabase.co`

describe('assertEnvironmentSeparation', () => {
  it('blocks local and preview builds from the production database', () => {
    expect(() => assertEnvironmentSeparation('local', prodUrl)).toThrow(/production database/)
    expect(() => assertEnvironmentSeparation('preview', prodUrl)).toThrow(/production database/)
  })
  it('allows production to use production, and anyone to use staging', () => {
    expect(() => assertEnvironmentSeparation('production', prodUrl)).not.toThrow()
    expect(() => assertEnvironmentSeparation('local', stagingUrl)).not.toThrow()
    expect(() => assertEnvironmentSeparation('preview', undefined)).not.toThrow()
  })
})
