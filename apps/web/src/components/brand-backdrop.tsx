/** The sign-up screens' background (owner, 2026-10-15): the onefan mark, large and faint, floating in a glow of the
 *  logo's own blue and green. Decorative only; the page sets `isolation: isolate` so it stays behind. */
export function BrandBackdrop() {
  return (
    <div className="brand-bg" aria-hidden="true">
      <span className="brand-bg-mark" />
    </div>
  )
}
