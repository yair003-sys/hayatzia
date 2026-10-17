import 'server-only'
import { getSessionProfile } from '@/features/profile/server/queries'
import { teamAccent } from '@/features/stand-home/schema'

// Stadium theme (stadium redesign, stage 3, 2026-10-17). The whole app, when the stadium design is on, is tinted in
// the fan's club colour. The colours come from teamAccent (the same readable-on-dark palette the home already uses),
// and are published once as CSS custom properties on :root through a tiny <style> the shell renders. Every stadium
// rule then reads var(--t-acc) / var(--t-rgb) etc. with a brand-blue fallback, so a signed-out shell (or CI, with no
// Supabase) still looks right in the brand colours.

/**
 * The `:root { --t-*: … }` declaration for this fan's club, or null when there is no club to theme by (signed out, no
 * profile, or no Supabase in this environment) — the stadium rules then fall back to the brand colours. Values are
 * taken only from teamAccent, which returns hex colours and an "r g b" triple, so nothing user-controlled is written
 * into the stylesheet. Reads the session (deduplicated per request); call inside <Suspense>.
 */
export async function stadiumThemeCss(): Promise<string | null> {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const a = teamAccent(s.team.bar)
  return `:root{--t-acc:${a.accent};--t-acc2:${a.accent2};--t-rgb:${a.rgb};--t-text:${a.text};--t-on:${a.on}}`
}
