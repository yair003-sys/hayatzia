'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  INTRO_PAGES,
  INTRO_SEEN_KEY,
  SPLASH_MS,
  dragPosition,
  pillRight,
  slideFrame,
  snapTarget,
  type IntroPage,
} from '../schema'
import { IntroArt } from './intro-art'

type Stage = 'splash' | 'welcome' | 'tour'
const N = INTRO_PAGES.length
const TURN_MS = 520

const noop = () => () => {}
function readSeen(): boolean {
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) !== null
  } catch {
    return true // no storage (private mode): never trap the fan in the intro
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {}
}

// Runs before React hydrates, so a returning fan never sees the intro flash.
const HIDE_IF_SEEN = `try{if(localStorage.getItem(${JSON.stringify(INTRO_SEEN_KEY)})!==null)document.head.insertAdjacentHTML('beforeend','<style>.fr-root{display:none!important}</style>')}catch(e){}`

/**
 * First time on this device only: the logo for 2 seconds, a welcome, then five pages that turn like a cube.
 * `then`: 'login' sends the fan to sign in at the end; 'close' just reveals the page underneath.
 */
export function FirstRunIntro({ then }: { then: 'login' | 'close' }) {
  const t = useTranslations('firstRun')
  const seen = useSyncExternalStore(noop, readSeen, () => false)
  const [closed, setClosed] = useState(false)
  const [stage, setStage] = useState<Stage>('splash')
  const router = useRouter()

  useEffect(() => {
    if (seen || closed) return
    const t = window.setTimeout(() => setStage((s) => (s === 'splash' ? 'welcome' : s)), SPLASH_MS)
    return () => window.clearTimeout(t)
  }, [seen, closed])

  const close = useCallback(() => {
    markSeen()
    setClosed(true)
  }, [])
  const start = useCallback(() => {
    markSeen()
    if (then === 'login') router.push('/login')
    else setClosed(true)
  }, [router, then])

  if (seen || closed) return null
  return (
    <div className="fr-root" role="dialog" aria-modal="true" aria-label={t('welcomeAria')}>
      <script dangerouslySetInnerHTML={{ __html: HIDE_IF_SEEN }} />
      <div className="fr-bg" aria-hidden="true" />

      <section className="fr-screen fr-splash" data-on={stage === 'splash'} aria-hidden={stage !== 'splash'}>
        <span className="fr-halo" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img src="/icons/logo.svg" alt="onefan" width={120} height={120} className="fr-mark" />
      </section>

      <section className="fr-screen fr-welcome" data-on={stage === 'welcome'} aria-hidden={stage !== 'welcome'}>
        <Wordmark />
        <h2 className="fr-hello">
          {t('helloHome')}
          <span>{t('homeOfFans')}</span>
        </h2>
        <p>{t('realFansOnly')}</p>
        <button type="button" className="fr-btn fr-btn-green" onClick={() => setStage('tour')} tabIndex={stage === 'welcome' ? 0 : -1}>
          {t('letsMeet')}
        </button>
      </section>

      <section className="fr-screen fr-tour" data-on={stage === 'tour'} aria-hidden={stage !== 'tour'}>
        {stage === 'tour' && <Tour onSkip={close} onDone={start} />}
      </section>
    </div>
  )
}

function Wordmark() {
  return (
    <span dir="ltr" className="inline-flex items-center gap-2 font-brand text-[22px] font-extrabold tracking-[-0.02em]">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
      <img src="/icons/logo.svg" alt="" width={30} height={30} />
      onefan
    </span>
  )
}

function Tour({ onSkip, onDone }: { onSkip: () => void; onDone: () => void }) {
  const t = useTranslations('firstRun')
  const stageRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLElement | null)[]>([])
  const pillRef = useRef<HTMLSpanElement>(null)
  const pos = useRef(0)
  const anim = useRef(0)
  const drag = useRef<{ x: number; start: number; lastX: number; lastT: number; v: number } | null>(null)
  const [active, setActive] = useState(0)
  const [settled, setSettled] = useState(false)

  const paint = useCallback((p: number) => {
    const w = stageRef.current?.clientWidth ?? 360
    slideRefs.current.forEach((el, i) => {
      if (!el) return
      const f = slideFrame(i, p, w)
      el.style.transform = f.transform
      el.style.transformOrigin = f.origin
      el.style.opacity = String(f.opacity)
      el.style.filter = `brightness(${f.brightness})`
      el.style.zIndex = String(f.z)
      el.style.visibility = f.visible ? 'visible' : 'hidden'
    })
    if (pillRef.current) pillRef.current.style.right = `${pillRight(p)}px`
  }, [])

  const goTo = useCallback(
    (target: number) => {
      const to = Math.max(0, Math.min(N - 1, target))
      const from = pos.current
      const t0 = performance.now()
      cancelAnimationFrame(anim.current)
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / TURN_MS)
        pos.current = from + (to - from) * (1 - (1 - k) ** 3)
        paint(pos.current)
        if (k < 1) anim.current = requestAnimationFrame(step)
        else {
          setActive(to)
          setSettled(true)
        }
      }
      anim.current = requestAnimationFrame(step)
    },
    [paint],
  )

  useEffect(() => {
    paint(pos.current)
    const t = window.setTimeout(() => setSettled(true), 350)
    const onResize = () => paint(pos.current)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(Math.round(pos.current) + 1)
      if (e.key === 'ArrowRight') goTo(Math.round(pos.current) - 1)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      cancelAnimationFrame(anim.current)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [paint, goTo])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(anim.current)
    drag.current = { x: e.clientX, start: pos.current, lastX: e.clientX, lastT: performance.now(), v: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
    setSettled(false)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    d.v = (e.clientX - d.lastX) / Math.max(1, now - d.lastT)
    d.lastX = e.clientX
    d.lastT = now
    pos.current = dragPosition(d.start, e.clientX - d.x, e.currentTarget.clientWidth, N)
    paint(pos.current)
  }
  const onUp = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    goTo(snapTarget(pos.current, d.start, d.v, N))
  }

  const last = active === N - 1
  return (
    <>
      <div className="fr-top">
        <span dir="ltr" className="font-brand text-[17px] font-extrabold tracking-[-0.02em]">
          onefan
        </span>
        <button type="button" className="fr-skip" onClick={onSkip}>
          {t('skip')}
        </button>
      </div>
      <div ref={stageRef} className="fr-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {INTRO_PAGES.map((p, i) => (
          <Slide
            key={p.id}
            page={p}
            n={i + 1}
            on={settled && i === active}
            hidden={i !== active}
            ref={(el) => {
              slideRefs.current[i] = el
            }}
          />
        ))}
      </div>
      <div className="fr-bottom">
        <div className="fr-dots" aria-hidden="true">
          {INTRO_PAGES.map((p) => (
            <span key={p.id} className="fr-dot" />
          ))}
          <span ref={pillRef} className="fr-pill" />
        </div>
        <p className="sr-only" aria-live="polite">
          {t('pageOf', { n: active + 1, total: N })}
        </p>
        <button type="button" className="fr-btn fr-btn-blue" onClick={() => (last ? onDone() : goTo(active + 1))}>
          {last ? t('letsStart') : t('next')}
        </button>
      </div>
    </>
  )
}

function Slide({ page, n, on, hidden, ref }: { page: IntroPage; n: number; on: boolean; hidden: boolean; ref: (el: HTMLElement | null) => void }) {
  const t = useTranslations('firstRun')
  return (
    <article ref={ref} className="fr-slide" data-in={on} aria-hidden={hidden}>
      <div className="fr-art" aria-hidden="true">
        <IntroArt id={page.id} />
        <span className="fr-demo">{t('demo')}</span>
      </div>
      <span className="fr-kicker">
        <i>{String(n).padStart(2, '0')}</i>
        {page.kicker}
      </span>
      <h2>{page.title}</h2>
      <p>{page.body}</p>
    </article>
  )
}
