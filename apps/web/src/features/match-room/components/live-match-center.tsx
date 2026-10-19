'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { X } from 'lucide-react'
import { Crest } from '@/features/matches/components/crest'
import type { DisplayTeam } from '@/features/matches/api-teams'

type Panel = { key: string; label: string; node: ReactNode }

/**
 * Full-screen, TikTok-style live match centre (stage 1): a fixed scoreboard over screens the fan swipes between —
 * crowd/chat, line-up, events. Swipe with a direction lock: a mostly-sideways drag turns the page, a mostly-vertical
 * one scrolls the screen you're on. Covers the whole app (nothing else shows), and locks the page behind it.
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
  backHref: string
  panels: Panel[]
}) {
  const router = useRouter()
  const N = panels.length
  const [idx, setIdx] = useState(0)
  const drag = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null)

  // Lock the page behind the full-screen centre so nothing scrolls under it.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const go = (i: number) => setIdx(Math.max(0, Math.min(N - 1, i)))
  const close = () => router.push(backHref as Route)

  const onDown = (e: ReactPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, axis: null }
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    if (d.axis === null) {
      const dx = Math.abs(e.clientX - d.x)
      const dy = Math.abs(e.clientY - d.y)
      if (dx < 8 && dy < 8) return
      d.axis = dx > dy ? 'x' : 'y' // sideways → turn the page; up/down → let the screen scroll
    }
  }
  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.axis !== 'x') return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 45) go(idx + (dx < 0 ? 1 : -1)) // RTL: swipe left → next screen
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-black" role="dialog" aria-modal="true" aria-label="מרכז המשחק החי">
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
          <div className="flex min-w-0 items-center gap-2 font-extrabold">
            <Crest team={home} />
            <span className="truncate">{home.short}</span>
          </div>
          <div className="text-center">
            <div className="text-2xl font-extrabold tabular-nums tracking-wide">{score}</div>
            <div className="text-[11px] font-extrabold text-live">{minute}</div>
          </div>
          <div className="flex min-w-0 flex-row-reverse items-center gap-2 text-left font-extrabold">
            <Crest team={away} />
            <span className="truncate">{away.short}</span>
          </div>
        </div>
      </header>

      {/* current label */}
      <div className="flex-none px-3.5 pt-2 text-center text-[13px] font-extrabold text-muted">{panels[idx]?.label}</div>

      {/* swipe deck: a track that slides; one full-screen panel at a time scrolls on its own.
          touch-action pan-y keeps vertical scroll inside the panel but hands us the sideways drag,
          so the browser never steals the swipe. The track is LTR so the page-turn maths stay simple;
          each panel keeps its own RTL inside. */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          dir="ltr"
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ width: `${N * 100}%`, transform: `translateX(-${idx * (100 / N)}%)` }}
        >
          {panels.map((p) => (
            <section key={p.key} dir="rtl" className="h-full overflow-y-auto overflow-x-hidden px-3.5 pb-16 pt-2" style={{ width: `${100 / N}%` }} aria-label={p.label}>
              {p.node}
            </section>
          ))}
        </div>
      </div>

      {/* dots */}
      <div className="flex-none flex justify-center gap-2 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2">
        {panels.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => go(i)}
            aria-label={p.label}
            aria-current={idx === i}
            className={`h-2 rounded-full transition-all ${idx === i ? 'w-6 bg-white' : 'w-2 bg-white/35'}`}
          />
        ))}
      </div>
    </div>
  )
}
