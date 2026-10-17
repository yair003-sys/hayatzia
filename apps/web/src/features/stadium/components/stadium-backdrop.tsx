// The one stadium backdrop for the whole app (stadium redesign, stage 3, 2026-10-17). A fixed, clipped layer behind
// every screen: the floodlit night sky, three sweeping beams and a crowd mosaic, all in the fan's club colour
// (var(--t-rgb), brand blue as the fallback). It is decorative and never interactive. Because it is position:fixed it
// cannot widen the page, so the OverflowGuard ignores it (the owner's 375px rule). The floodlights and the shimmer are
// the only motion, and prefers-reduced-motion stops them (see .std-bg in globals.css).

/** The app-wide stadium backdrop. Rendered once by the shell decor; individual screens never add their own. */
export function StadiumBackdrop() {
  return (
    <div className="std-bg" aria-hidden="true">
      <span className="std-beam std-beam-1" />
      <span className="std-beam std-beam-2" />
      <span className="std-beam std-beam-3" />
      <span className="std-mosaic" />
    </div>
  )
}
