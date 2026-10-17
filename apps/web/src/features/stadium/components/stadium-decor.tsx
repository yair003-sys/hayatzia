import { designVersion } from '@/lib/design-version'
import { StadiumBackdrop } from './stadium-backdrop'
import { stadiumThemeCss } from '../server/theme'

// The stadium shell decor (stadium redesign, stage 3, 2026-10-17). Two near-identical server components that turn the
// whole app into the stadium look when the per-browser onefan_design cookie is "stadium", and render nothing at all
// when it is not — so the classic app keeps the exact same DOM and behaviour.
//
// Engineering call: the look is switched on with a hidden marker (.std-app-active) plus body:has() rules in
// globals.css, not by adding a class to the shared page wrapper. The wrapper and the tab bar stay static (part of the
// prerendered shell) that way, and classic users lose nothing; only this small decor, read request-time, is dynamic.
// It lives inside <Suspense> in the two layouts, so reading the cookie never blocks the shell.

/** The app shell (signed-in screens): the backdrop, the club theme on :root, and the marker that flips the app look. */
export async function AppStadiumDecor() {
  if ((await designVersion()) !== 'stadium') return null
  const css = await stadiumThemeCss()
  return (
    <>
      {css && <style>{css}</style>}
      <StadiumBackdrop />
      <i className="std-app-active" aria-hidden="true" hidden />
    </>
  )
}

/** The public shell (login / onboarding): the same backdrop and marker, in the brand colours (no club to theme by). */
export async function PublicStadiumDecor() {
  if ((await designVersion()) !== 'stadium') return null
  return (
    <>
      <StadiumBackdrop />
      <i className="std-app-active" data-scope="public" aria-hidden="true" hidden />
    </>
  )
}
