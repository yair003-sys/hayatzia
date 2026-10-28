import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'
import { updateSession } from '@/lib/supabase/proxy'

// Per request: on real pages next-intl resolves the locale and rewrites to the `[locale]` segment (Hebrew stays
// un-prefixed); API and auth routes are left alone. Then the Supabase session cookie is refreshed onto whatever
// response resulted, so the two compose and nothing loses its refreshed auth cookies.
const handleI18n = createMiddleware(routing)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPage = !pathname.startsWith('/api') && !pathname.startsWith('/auth')
  const response = isPage ? handleI18n(request) : undefined
  return updateSession(request, response)
}

// Same reach as before: skip Next internals, the shared alerts API, and static files. (Session refresh still runs on
// API/auth; only the locale rewrite is gated to pages, inside the handler above.)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/alerts|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
