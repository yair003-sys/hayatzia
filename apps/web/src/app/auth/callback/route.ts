import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/features/auth/safe-next'
import { createClient } from '@/lib/supabase/server'

/** OAuth return: exchanges the code for a session cookie, then continues inside the app only. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))
  const supabase = await createClient()
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  }
  return NextResponse.redirect(new URL('/login?error=1', url.origin))
}
