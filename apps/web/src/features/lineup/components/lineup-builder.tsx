'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  checkXI,
  clearSlot,
  FORMATIONS,
  formationSlots,
  placeAt,
  ROLE_HE,
  SLOT_HE,
  swapSlots,
  toPayload,
  XI_PROBLEM_HE,
  XI_SIZE,
  type Formation,
  type Role,
  type SaveLineupInput,
  type SavedLineup,
  type SquadPlayer,
  type XI,
} from '../schema'

type Saved = SavedLineup
type Props = {
  fixtureId: number
  team: { short: string; bg: string; ring: string }
  squad: SquadPlayer[]
  initial: Saved
  onSave: (input: SaveLineupInput) => Promise<{ ok: true } | { error: string }>
  onSaved: (saved: Saved) => void
  /** Called once the overlay's history entry is gone (back button, Escape, close, after saving). */
  onClose: () => void
}
type Sel = { slot: number } | { player: string } | null
type Target = number | 'bench' | null
type Press = { id: string; from: number | null; x0: number; y0: number; pointerId: number; active: boolean }
type Ghost = { id: string; x: number; y: number; over: Target }

const DRAG_PX = 6
const HISTORY_KEY = 'lineupBuilder'
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/** The current history state as a plain object (Next keeps its router fields there), without our marker. */
function baseState(): { state: Record<string, unknown>; stale: boolean } {
  const cur = window.history.state
  const state: Record<string, unknown> = cur && typeof cur === 'object' ? { ...(cur as Record<string, unknown>) } : {}
  const stale = HISTORY_KEY in state
  delete state[HISTORY_KEY]
  return { state, stale }
}

/** What is under the finger: a slot (`data-drop="3"`), the squad strip (`data-drop="bench"`), or nothing. */
function targetAt(x: number, y: number): Target {
  if (typeof document.elementFromPoint !== 'function') return null
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')
  const v = el?.dataset.drop
  if (v === undefined) return null
  if (v === 'bench') return 'bench'
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n < XI_SIZE ? n : null
}

/**
 * Full-screen builder (an in-app overlay, not the Fullscreen API): the pitch on top, the club's squad below.
 * Drag with Pointer Events (mouse and touch, no long press): a strip player onto a slot, a pitch player onto another
 * slot (swap) or back onto the strip (bench). Without dragging: tap a slot then a player, or a player then a slot;
 * every target is a real button, so the keyboard does the same with Tab and Enter.
 */
export function LineupBuilder({ fixtureId, team, squad, initial, onSave, onSaved, onClose }: Props) {
  const [formation, setFormation] = useState<Formation>(initial.formation)
  const [xi, setXI] = useState<XI>(initial.xi)
  const [sel, setSel] = useState<Sel>(null)
  const [filter, setFilter] = useState<Role | 'ALL'>('ALL')
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const backdrop = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const press = useRef<Press | null>(null)
  const droppedAt = useRef(-Infinity)
  const onCloseRef = useRef(onClose)
  // The overlay's own history entry: pushed by this mount, popped by back (or by leave()), left at most once.
  const pushed = useRef(false)
  const popped = useRef(false)
  const leaving = useRef(false)
  const frame = useRef<number | null>(null)
  const latest = useRef<Ghost | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  /** Every way out goes through here: back over our own entry when it is still there, else close directly. */
  const leave = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    if (pushed.current && !popped.current) window.history.back()
    else onCloseRef.current()
  }, [])

  // Modal: a fresh history entry of its own (back closes), the page behind inert, body scroll locked and restored,
  // focus inside and trapped, Escape closes, focus back on the opener afterwards.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const scrollY = window.scrollY
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const root = backdrop.current
    const madeInert = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== root && !el.inert)
    for (const el of madeInert) el.inert = true
    // A marker left on the current entry (an earlier overlay whose entry was never popped) is stripped first, keeping
    // Next's router fields, so it can never be mistaken for this mount's entry.
    const { state, stale } = baseState()
    if (stale) window.history.replaceState(state, '')
    window.history.pushState({ ...state, [HISTORY_KEY]: true }, '')
    pushed.current = true
    popped.current = false
    leaving.current = false
    closeBtn.current?.focus()
    const onPop = () => {
      if (popped.current) return
      popped.current = true
      leaving.current = true // closing now: a late Escape or tap must not close (or go back) again
      onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        leave()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) return
      if (!panel.current.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('popstate', onPop)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('keydown', onKey)
      for (const el of madeInert) el.inert = false
      document.body.style.overflow = overflow
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY)
      opener?.focus()
    }
  }, [leave])

  const byId = new Map(squad.map((p) => [p.id, p]))
  const squadIds = new Set(byId.keys())
  const spots = formationSlots(formation)
  const filled = xi.filter(Boolean).length
  const problem = checkXI(xi, squadIds)
  const onPitch = new Set(xi.filter((p): p is string => !!p))
  const nameOf = (id: string | null | undefined) => (id ? (byId.get(id)?.short ?? '') : '')

  function put(slot: number, id: string) {
    const next = placeAt(xi, slot, id)
    setXI(next)
    setError(null)
    setNote(`${nameOf(id)} ב${SLOT_HE[spots[slot]!.role]}`)
    return next
  }

  function bench(slot: number) {
    const id = xi[slot]
    if (!id) return
    setXI(clearSlot(xi, slot))
    setNote(`${nameOf(id)} חזר לספסל`)
  }

  // ── taps (and keyboard) ──
  function tapSlot(slot: number, e: MouseEvent) {
    if (e.timeStamp - droppedAt.current < 400) return // the click that ends a drag
    if (sel && 'player' in sel) {
      put(slot, sel.player)
      setSel(null)
    } else if (sel && 'slot' in sel) {
      if (sel.slot !== slot) {
        setXI(swapSlots(xi, sel.slot, slot))
        setNote('השחקנים הוחלפו')
      }
      setSel(null)
    } else {
      setSel({ slot })
      setNote(`בחר שחקן לעמדת ${SLOT_HE[spots[slot]!.role]}`)
    }
  }

  function tapPlayer(id: string, e: MouseEvent) {
    if (e.timeStamp - droppedAt.current < 400) return
    if (sel && 'slot' in sel) {
      const at = sel.slot
      const next = put(at, id)
      // Keep going: the next empty slot is selected, so the XI fills with a tap per player.
      const empty = next.findIndex((p, i) => !p && i > at)
      const nextSlot = empty >= 0 ? empty : next.indexOf(null)
      setSel(nextSlot >= 0 ? { slot: nextSlot } : null)
    } else if (sel && 'player' in sel && sel.player === id) {
      setSel(null)
    } else {
      setSel({ player: id })
      setNote(`בחר עמדה ל${nameOf(id)}`)
    }
  }

  // ── drag (Pointer Events: mouse, touch, pen) ──
  /** The ghost follows the finger at most once per frame. */
  function showGhost(g: Ghost) {
    latest.current = g
    if (typeof requestAnimationFrame !== 'function') return setGhost(g)
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      setGhost(latest.current)
    })
  }

  function endDrag() {
    press.current = null
    latest.current = null
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    setGhost(null)
  }

  /** Only the pointer that started the press counts; a second finger is ignored. */
  const mine = (e: PointerEvent<HTMLElement>) => press.current !== null && press.current.pointerId === e.pointerId

  function dragHandlers(id: string, from: number | null) {
    return {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (press.current) return
        if (e.pointerType === 'mouse' && e.button !== 0) return
        press.current = { id, from, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, active: false }
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const p = press.current
        if (!p || !mine(e) || p.id !== id) return
        if (!p.active) {
          if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < DRAG_PX) return
          p.active = true
          setSel(null)
          if (typeof e.currentTarget.setPointerCapture === 'function') {
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              // An already released pointer: the drag still works from the moves we get.
            }
          }
        }
        showGhost({ id, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY) })
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        if (!mine(e)) return
        const p = press.current!
        endDrag()
        if (!p.active) return
        droppedAt.current = e.timeStamp
        const to = targetAt(e.clientX, e.clientY)
        if (typeof to === 'number') put(to, p.id)
        else if (to === 'bench' && p.from !== null) bench(p.from)
      },
      onPointerCancel(e: PointerEvent<HTMLElement>) {
        // The browser took the gesture (e.g. the strip scrolls sideways): nothing moves.
        if (mine(e)) endDrag()
      },
    }
  }

  function save() {
    if (problem) {
      setError(XI_PROBLEM_HE[problem])
      return
    }
    setError(null)
    start(async () => {
      const r = await onSave({ fixtureId, formation, slots: toPayload(xi) })
      if ('error' in r) {
        setError(r.error)
        return
      }
      onSaved({ formation, xi })
      leave()
    })
  }

  const selSlot = sel && 'slot' in sel ? sel.slot : null
  const selPlayer = sel && 'player' in sel ? sel.player : null
  const shown = filter === 'ALL' ? squad : squad.filter((p) => p.role === filter)
  const colours = { '--a': team.bg, '--b': team.ring, '--t': team.ring } as CSSProperties
  const ghostPlayer = ghost ? byId.get(ghost.id) : undefined

  return createPortal(
    // The backdrop covers the whole screen (wide screens too) so nothing behind can be clicked; the page itself is
    // also made inert while the overlay is open.
    <div ref={backdrop} className="lu-backdrop">
      <div ref={panel} className="lu-overlay" role="dialog" aria-modal="true" aria-labelledby="lu-title" style={colours}>
        <div className="lu-head">
          <h2 id="lu-title">
            ההרכב שלי <span>· {team.short}</span>
          </h2>
          <span className="lu-count t-num" aria-label={`${filled} מתוך 11 שחקנים`}>
            {filled}/11
          </span>
          <button ref={closeBtn} type="button" className="lu-x" aria-label="סגור" onClick={() => leave()}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="lu-forms" role="group" aria-label="מערך">
          {FORMATIONS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={f === formation}
              onClick={() => {
                setFormation(f)
                setNote(`מערך ${f}`)
              }}
            >
              <bdi className="t-num">{f}</bdi>
            </button>
          ))}
        </div>

        <div className="lc-pitch lu-pitch">
          <i className="lc-pitch-arc" />
          <i className="lc-pitch-box" />
          <i className="lc-pitch-six" />
          {spots.map((s) => {
            const id = xi[s.slot] ?? null
            const p = id ? byId.get(id) : undefined
            return (
              <button
                key={s.slot}
                type="button"
                className="lu-slot"
                data-drop={s.slot}
                data-filled={p ? '' : undefined}
                data-over={ghost?.over === s.slot ? '' : undefined}
                aria-pressed={selSlot === s.slot}
                aria-label={`עמדת ${SLOT_HE[s.role]}: ${p ? p.name : 'ריקה'}`}
                style={{ left: `${s.x}%`, bottom: `${s.y}%` }}
                onClick={(e) => tapSlot(s.slot, e)}
                {...(p ? dragHandlers(p.id, s.slot) : {})}
              >
                <i>{p ? (p.number ?? '') : '+'}</i>
                <small>{p ? p.short : SLOT_HE[s.role]}</small>
              </button>
            )
          })}
        </div>

        <div className="lu-hint">
          <p role="status">{note || 'גוררים שחקן למגרש, או מקישים על עמדה ואז על שחקן'}</p>
          {selSlot !== null && xi[selSlot] && (
            <button
              type="button"
              className="lu-bench-btn"
              onClick={() => {
                bench(selSlot)
                setSel(null)
              }}
            >
              הוצא לספסל
            </button>
          )}
        </div>

        <div className="lu-filter" role="group" aria-label="סינון לפי עמדה">
          {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={filter === r} onClick={() => setFilter(r)}>
              {r === 'ALL' ? 'הכול' : ROLE_HE[r]}
            </button>
          ))}
        </div>

        <ul className="lu-strip" data-drop="bench" data-over={ghost?.over === 'bench' ? '' : undefined} aria-label={`הסגל של ${team.short}`}>
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="lu-card"
                data-in={onPitch.has(p.id) ? '' : undefined}
                data-injured={p.injured ? '' : undefined}
                aria-pressed={selPlayer === p.id}
                aria-label={[p.name, ROLE_HE[p.role], p.injured ? 'פצוע' : null, onPitch.has(p.id) ? 'בהרכב' : null].filter(Boolean).join(', ')}
                onClick={(e) => tapPlayer(p.id, e)}
                {...dragHandlers(p.id, xi.indexOf(p.id) >= 0 ? xi.indexOf(p.id) : null)}
              >
                <i className="t-num">{p.number ?? ''}</i>
                <span>{p.short}</span>
                <small>{p.injured ? 'פצוע' : ROLE_HE[p.role]}</small>
              </button>
            </li>
          ))}
        </ul>

        <div className="lu-foot">
          {error && (
            <p role="alert" className="lu-error">
              {error}
            </p>
          )}
          <button type="button" className="lu-save" data-ready={problem ? undefined : ''} disabled={pending} onClick={save}>
            {pending ? 'שומר…' : 'שמור את ההרכב שלי'}
          </button>
        </div>

        {ghost && ghostPlayer && (
          <div className="lu-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
            <i>{ghostPlayer.number ?? ''}</i>
            <small>{ghostPlayer.short}</small>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
