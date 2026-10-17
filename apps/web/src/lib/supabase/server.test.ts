// @vitest-environment node
// Load test 2026-10-17, finding 7: the server client reads the clock as soon as it is made, so it must be made only
// after `connection()` (never inside a prerender, where Next.js reports "Date.now() while prerendering").
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ order: [] as string[] }))
vi.mock('server-only', () => ({}))
vi.mock('./config', () => ({ supabaseConfig: () => ({ url: 'http://127.0.0.1:54321', key: 'local' }) }))
vi.mock('next/headers', () => ({
  cookies: async () => {
    h.order.push('cookies')
    return { getAll: () => [], set: () => {} }
  },
}))
vi.mock('next/server', () => ({
  connection: async () => {
    h.order.push('connection')
  },
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => {
    h.order.push('client')
    return {}
  },
}))

const { createClient } = await import('./server')

beforeEach(() => {
  h.order = []
})

describe('server Supabase client', () => {
  it('is created only after connection() (request time)', async () => {
    await createClient()
    expect(h.order).toEqual(['cookies', 'connection', 'client'])
  })
})
