// Crisp, consistent emoji. Instead of the device's own emoji font (which looks flat on some Androids, Windows and
// Linux and differs device to device), we draw each emoji as a small bundled Twemoji SVG from /public/emoji. The set
// is the controlled reaction set (see chat/schema.ts), so every code point has a file. If a file is ever missing the
// <img> alt falls back to the native glyph on its own, so nothing breaks. Twemoji is CC-BY 4.0 (credited in About).

/** Twemoji file name for an emoji: its code points in lowercase hex joined by "-", with the FE0F variation selector
 *  dropped (Twemoji's own naming). Iterating the string yields whole code points, so surrogate pairs are handled. */
export function emojiCode(emoji: string): string {
  return [...emoji]
    .filter((c) => c !== '️')
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-')
}

export function Emoji({
  emoji,
  size = 20,
  className,
  decorative = false,
}: {
  emoji: string
  size?: number
  className?: string
  /** True when a parent element already carries the label (e.g. a button's aria-label), so the image is hidden
   *  from screen readers to avoid a double announcement. */
  decorative?: boolean
}) {
  return (
    <img
      src={`/emoji/${emojiCode(emoji)}.svg`}
      alt={decorative ? '' : emoji}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ display: 'inline-block', verticalAlign: '-0.15em' }}
    />
  )
}
