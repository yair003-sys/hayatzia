import { cn } from '@/lib/utils'

/**
 * The onefan logo: the rising-terraces mark + the lowercase wordmark (redesign 2026-11-05).
 * The mark is inline SVG so its highlighted bar, the dot, and the wordmark's full stop take the fan's club
 * colour (--acc) wherever one is set, and fall back to the current text colour on neutral/public screens.
 * The shorter bars are always currentColor, so the logo sits in white/steel with one club-coloured accent.
 */
export function Brand({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span dir="ltr" className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" className="shrink-0">
        <rect x="2" y="24" width="7" height="14" rx="2" fill="currentColor" opacity=".55" />
        <rect x="11" y="18" width="7" height="20" rx="2" fill="currentColor" opacity=".8" />
        <rect x="20" y="12" width="7" height="26" rx="2" fill="currentColor" />
        <rect x="30" y="3" width="7" height="35" rx="2" fill="var(--acc, currentColor)" />
        <rect x="26" y="3" width="4" height="4" rx="1" fill="var(--acc, currentColor)" />
      </svg>
      <span className="font-brand font-extrabold tracking-[-0.02em]">
        onefan<span style={{ color: 'var(--acc, currentColor)' }}>.</span>
      </span>
    </span>
  )
}
