import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SAFE_NEXT = new Set(['/onboarding', '/stand', '/matches', '/square', '/inbox', '/me'])

/** OAuth return: exchanges the code for a session cookie, then continues inside the app only. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next') ?? '/onboarding'
  const next = SAFE_NEXT.has(nextParam) ? nextParam : '/onboarding'
  const supabase = await createClient()
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  }
  return NextResponse.redirect(new URL('/login?error=1', url.origin))
}
