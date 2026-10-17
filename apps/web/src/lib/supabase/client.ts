'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig } from './config'
import type { Database } from './database.types'

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>
let browser: BrowserClient | null = null

/**
 * The browser's Supabase client (one per tab). Call it in effects and event handlers only, never while rendering
 * (not in a `useState` initialiser either): a client component also renders on the server, and the client's auth
 * start reads the clock, which Next.js reports as "Date.now() while prerendering" on every page (load test
 * 2026-10-17, finding 7).
 */
export function createClient(): BrowserClient {
  const cfg = supabaseConfig()
  if (!cfg) throw new Error('Supabase is not configured for this environment')
  // Never kept on the server, where one module serves every fan.
  if (typeof window === 'undefined') return createBrowserClient<Database>(cfg.url, cfg.key)
  browser ??= createBrowserClient<Database>(cfg.url, cfg.key)
  return browser
}
