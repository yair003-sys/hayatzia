'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { X } from 'lucide-react'
import { Crest } from '@/features/matches/components/crest'
import type { DisplayTeam } from '@/features/matches/api-teams'

type Panel = { key: string; label: string; node: ReactNode }

/**
 * Full-screen, TikTok-style live match centre (stage 1 of the live-centre spec): a fixed scoreboard over three screens
 * the fan swipes between — crowd/chat, line-up, events. Horizontal scroll-snap handles the swipe natively (and RTL
 * correctly); each screen scrolls on its own. The battle bar, the live uploads and the drag-substitutions come in the
 * next stages; this is the shell with the real content wired in.
 */
export function LiveMatchCenter({
  home,
  away,
  score,
  minute,
  live,
  backHref,
  panels,
}: {
  home: DisplayTeam
  away: DisplayTeam
  score: string
  minute: string
  live: boolean
  backHref: Route
  panels: Panel[]
}) {
  const router = useRouter()
  const scroller = useRef<HTMLDivElement>(null)
  const refs = useRef<(HTMLElement | null)[]>([])
  const [active, setActive] = useState(0)

  // Which screen is in view — IntersectionObserver is robust where RTL scrollLeft signs are not.
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = refs.current.indexOf(e.target as HTMLElement)
            if (i >= 0) setActive(i)
          }
        }
      },
      { root, threshold: 0.6 },
    )
    refs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [panels.length])

  const goTo = (i: number) => refs.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  const close = () => router.push(backHref)

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="מרכז המשחק החי">
      {/* scoreboard — always on top */}
      <header
        className="relative z-10 flex-none px-3.5 pb-2.5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.6rem)', background: 'linear-gradient(180deg,#0c1322,rgba(12,19,34,.6))' }}
      >
        <div className="flex items-center justify-between">
          <button type="button" onClick={close} aria-label="סגירה" className="sq-round">
            <X className="size-5" aria-hidden="true" />
          </button>
          {live && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-live">
              <i className="size-2 rounded-full bg-live motion-safe:animate-pulse" aria-hidden="true" />
              LIVE
            </span>
          )}
          <span className="w-9" aria-hidden="true" />
        </div>
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          <div className="flex items-center gap-2 font-extrabold">
            <Crest team={home} />
            <span className="truncate">{home.short}</span>
          </div>
          <div className="text-center">
            <div className="text-2xl font-extrabold tabular-nums tracking-wide">{score}</div>
            <div className="text-[11px] font-extrabold text-live">{minute}</div>
          </div>
          <div className="flex flex-row-reverse items-center gap-2 text-left font-extrabold">
            <Crest team={away} />
            <span className="truncate">{away.short}</span>
          </div>
        </div>
      </header>

      {/* swipe deck */}
      <div
        ref={scroller}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {panels.map((p, i) => (
          <section
            key={p.key}
            ref={(el) => {
              refs.current[i] = el
            }}
            className="h-full w-full flex-none snap-center overflow-y-auto overflow-x-hidden px-3.5 pb-16 pt-2"
            aria-label={p.label}
          >
            {p.node}
          </section>
        ))}
      </div>

      {/* dots */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center gap-2 pb-[max(0.8rem,env(safe-area-inset-bottom))]">
        {panels.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => goTo(i)}
            aria-label={p.label}
            aria-current={active === i}
            className={`pointer-events-auto h-2 rounded-full transition-all ${active === i ? 'w-6 bg-white' : 'w-2 bg-white/35'}`}
          />
        ))}
      </div>
    </div>
  )
}
