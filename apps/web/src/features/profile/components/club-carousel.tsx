'use client'

import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import type { Team } from '@/features/teams/data'
import { CLUB_STEP_PX, clubFrame, settleClub } from '../carousel'

const SETTLE_MS = 420

/** Cover-flow of the league's clubs: swipe, tap a club, or use the arrow keys. `index` is the club in the middle. */
export function ClubCarousel({ teams, index, onChange }: { teams: readonly Team[]; index: number; onChange: (i: number) => void }) {
  const tr = useTranslations('clubs')
  const cards = useRef<(HTMLButtonElement | null)[]>([])
  const pos = useRef(index)
  const anim = useRef(0)
  const drag = useRef<{ x: number; start: number; lastX: number; lastT: number; v: number; moved: boolean } | null>(null)
  const n = teams.length

  const paint = useCallback((p: number) => {
    cards.current.forEach((el, i) => {
      if (!el) return
      const f = clubFrame(i, p)
      el.style.transform = f.transform
      el.style.zIndex = String(f.z)
      el.style.opacity = String(f.opacity)
      el.dataset.picked = String(f.picked)
    })
  }, [])

  const goTo = useCallback(
    (target: number) => {
      const to = Math.max(0, Math.min(n - 1, target))
      const from = pos.current
      const t0 = performance.now()
      cancelAnimationFrame(anim.current)
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / SETTLE_MS)
        pos.current = from + (to - from) * (1 - (1 - k) ** 3)
        paint(pos.current)
        if (k < 1) anim.current = requestAnimationFrame(step)
      }
      anim.current = requestAnimationFrame(step)
      onChange(to)
    },
    [n, onChange, paint],
  )

  useEffect(() => {
    paint(pos.current)
    return () => cancelAnimationFrame(anim.current)
  }, [paint])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(anim.current)
    drag.current = { x: e.clientX, start: pos.current, lastX: e.clientX, lastT: performance.now(), v: 0, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 4) d.moved = true
    const now = performance.now()
    d.v = (e.clientX - d.lastX) / Math.max(1, now - d.lastT)
    d.lastX = e.clientX
    d.lastT = now
    pos.current = Math.max(-0.4, Math.min(n - 0.6, d.start + dx / CLUB_STEP_PX)) // drag right = next club (RTL)
    paint(pos.current)
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (!d.moved) {
      const hit = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLButtonElement>('[data-club]')
      const i = hit ? Number(hit.dataset.club) : -1
      if (i >= 0) return goTo(i)
    }
    goTo(settleClub(pos.current, d.v, n))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goTo(Math.round(pos.current) + 1)
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      goTo(Math.round(pos.current) - 1)
    }
  }

  return (
    <div
      className="su-carousel"
      role="radiogroup"
      aria-label={tr('leagueTeams')}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    >
      {teams.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          data-club={i}
          ref={(el) => {
            cards.current[i] = el
          }}
          className="su-club"
          // Pointer taps are handled by the carousel; this covers keyboard and screen readers.
          onClick={(e) => {
            if (e.detail === 0) goTo(i)
          }}
        >
          <span className="band" style={{ background: `linear-gradient(160deg, ${t.bg}, ${t.bg}cc 60%, ${t.ring}55)` }} aria-hidden="true" />
          <span className="scarf" style={{ background: `repeating-linear-gradient(180deg, ${t.bg} 0 14px, ${t.ring} 14px 20px)` }} aria-hidden="true" />
          <b>{t.name}</b>
          <small>{tr('league')}</small>
        </button>
      ))}
    </div>
  )
}
