import { cn } from '@/lib/utils'

/** The onefan logo: the app icon plus the lowercase wordmark (owner's brand guide, 2026-10-12). */
export function Brand({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span dir="ltr" className={cn('inline-flex items-center gap-2', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image adds nothing here */}
      <img src="/icons/logo.svg" alt="" width={size} height={size} />
      <span className="font-brand font-extrabold tracking-[-0.02em]">onefan</span>
    </span>
  )
}
