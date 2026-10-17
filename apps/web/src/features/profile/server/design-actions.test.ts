// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const s = vi.hoisted(() => ({
  sets: [] as { name: string; value: string; options: unknown }[],
  deletes: [] as string[],
  revalidated: [] as { path: string; type?: string }[],
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: unknown) => {
      s.sets.push({ name, value, options })
    },
    delete: (name: string) => {
      s.deletes.push(name)
    },
  }),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (path: string, type?: string) => {
    s.revalidated.push({ path, type })
  },
}))

import { setDesignVersion } from './design-actions'

beforeEach(() => {
  s.sets = []
  s.deletes = []
  s.revalidated = []
})

describe('setDesignVersion: the per-browser design switch', () => {
  it('sets the onefan_design cookie to "stadium" for a year, then revalidates the app', async () => {
    const r = await setDesignVersion('stadium')
    expect(r).toEqual({ ok: true, version: 'stadium' })
    expect(s.sets).toHaveLength(1)
    expect(s.sets[0]!.name).toBe('onefan_design')
    expect(s.sets[0]!.value).toBe('stadium')
    expect(s.sets[0]!.options).toMatchObject({ path: '/', sameSite: 'lax' })
    expect((s.sets[0]!.options as { maxAge: number }).maxAge).toBeGreaterThan(60 * 60 * 24 * 300)
    expect(s.deletes).toEqual([])
    expect(s.revalidated).toEqual([{ path: '/', type: 'layout' }])
  })

  it('clears the cookie back to the current design on "classic"', async () => {
    const r = await setDesignVersion('classic')
    expect(r).toEqual({ ok: true, version: 'classic' })
    expect(s.deletes).toEqual(['onefan_design'])
    expect(s.sets).toEqual([])
    expect(s.revalidated).toEqual([{ path: '/', type: 'layout' }])
  })

  it('treats an unknown value as the default (clears), never as opting in', async () => {
    const r = await setDesignVersion('nope' as never)
    expect(r.version).toBe('classic')
    expect(s.deletes).toEqual(['onefan_design'])
    expect(s.sets).toEqual([])
  })
})
