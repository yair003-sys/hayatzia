// Where the sign-in may continue: a fixed list of app pages, plus the add page of a scanned QR code (2026-10-16), so a
// signed-out fan who scans a code at the stadium comes back to that fan's card. Anything else goes to onboarding.

const SAFE_NEXT = new Set(['/onboarding', '/stand', '/matches', '/square', '/inbox', '/me'])
const ADD_PAGE = /^\/add\/[A-Za-z0-9_-]{22,64}$/

export function safeNext(param: string | null | undefined): string {
  if (!param) return '/onboarding'
  return SAFE_NEXT.has(param) || ADD_PAGE.test(param) ? param : '/onboarding'
}
