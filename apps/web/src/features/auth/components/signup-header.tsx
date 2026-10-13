import type { ReactNode } from 'react'

/** Top of every sign-up step: the wordmark (or a back button) and three step bars (Google, phone, club). */
export function SignupHeader({ step, back }: { step: 1 | 2 | 3; back?: ReactNode }) {
  return (
    <div className="su-head">
      {back ?? (
        <span dir="ltr" className="inline-flex items-center gap-2 font-brand text-lg font-extrabold tracking-[-0.02em]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
          <img src="/icons/logo.svg" alt="" width={26} height={26} />
          onefan
        </span>
      )}
      <span className="su-steps" role="img" aria-label={`שלב ${step} מתוך 3`}>
        {[1, 2, 3].map((n) => (
          <i key={n} data-on={n <= step} />
        ))}
      </span>
    </div>
  )
}

export function SignupKicker({ n, children }: { n: string; children: ReactNode }) {
  return (
    <span className="su-kicker">
      <i>{n}</i>
      {children}
    </span>
  )
}
