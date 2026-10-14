import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

// /api/alerts (the dispatch call and the banner's per-alert text) reads no session: skipping the proxy keeps those
// responses free of Set-Cookie (so the CDN can share them) and spares a session refresh per fan per goal.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/alerts|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
