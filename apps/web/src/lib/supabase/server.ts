import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { supabaseConfig } from './config'
import type { Database } from './database.types'

/**
 * Per-request client for Server Components, Server Actions and Route Handlers (reads the session cookie).
 * Request time only: `connection()` keeps it out of every prerender, including the ones Next.js runs with the request's
 * cookies. The client reads the clock as soon as it is made (auth-js loads the session from the cookie and checks its
 * expiry), which Next.js reports as "Date.now() while prerendering" (load test 2026-10-17, finding 7: ~1,500 times per
 * run, on every signed-in route).
 */
export async function createClient() {
  const cfg = supabaseConfig()
  if (!cfg) return null
  const cookieStore = await cookies()
  await connection()
  return createServerClient<Database>(cfg.url, cfg.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes them instead.
        }
      },
    },
  })
}
