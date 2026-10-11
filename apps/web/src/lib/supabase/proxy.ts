import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseConfig } from './config'

/** Refreshes the auth session cookie on every request. Never makes access decisions (those live in RLS). */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const cfg = supabaseConfig()
  if (!cfg) return response
  const supabase = createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
      },
    },
  })
  // Validates the JWT and refreshes it when needed. Must run before any response is returned.
  await supabase.auth.getClaims()
  return response
}
