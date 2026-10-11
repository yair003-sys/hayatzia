import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseConfig } from './config'
import type { Database } from './database.types'

/** Per-request client for Server Components, Server Actions and Route Handlers (reads the session cookie). */
export async function createClient() {
  const cfg = supabaseConfig()
  if (!cfg) return null
  const cookieStore = await cookies()
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
