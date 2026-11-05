import { getSessionProfile } from '@/features/profile/server/queries'
import { teamAccent } from '@/features/stand-home/schema'

/**
 * Paints the whole app in the fan's club colour (redesign 2026-11-05). The session read is dynamic (cookies), so
 * this must live inside a <Suspense> in the layout — Next 16 Cache Components treats a dynamic read outside a
 * boundary as a build error. It emits a <style> that sets --t-* on .app-shell; globals.css maps those onto the
 * real accent tokens, so every screen inherits the colour. Values come from teamAccent() — hex/rgb from our own
 * palette, so they are safe to inline. Session-less screens render nothing and fall back to the neutral brand.
 */
export async function ClubTheme() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const a = teamAccent(s.team.bar)
  const css = `.app-shell{--t-acc:${a.accent};--t-acc2:${a.accent2};--t-rgb:${a.rgb};--t-text:${a.text};--t-on:${a.on}}`
  return <style>{css}</style>
}
