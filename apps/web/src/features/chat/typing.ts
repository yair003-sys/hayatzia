// "N אוהדים כותבים…" in the public chats (club chat, match room). The signal rides on Realtime Presence: fans may
// track presence on `online:<club>` and `room:<fixture>` (stand_home migration) but may not send broadcasts. Presence
// payloads come from the browser, so they are never trusted as identity: the UI shows a count only, never names.

/** One fan's presence metadata as it arrives (client-supplied, so every field is unknown until checked). */
export type PresenceMeta = { user_id?: unknown; typing?: unknown }

export const TYPING_THROTTLE_MS = 2_000
export const TYPING_IDLE_MS = 4_000
export const TYPING_ANNOUNCE_MS = 10_000

/** Distinct fans typing now: not me, not fans I hid or blocked (checked by presence key and by user_id). */
export function countTyping(state: Record<string, PresenceMeta[]>, meId: string, hidden: readonly string[] = []): number {
  const ids = new Set<string>()
  for (const [key, metas] of Object.entries(state)) {
    for (const m of metas) {
      if (m.typing !== true) continue
      const id = typeof m.user_id === 'string' && m.user_id ? m.user_id : key
      if (id === meId || key === meId || hidden.includes(id) || hidden.includes(key)) continue
      ids.add(id)
    }
  }
  return ids.size
}

export function typingLabel(n: number): string {
  if (n <= 0) return ''
  if (n === 1) return 'אוהד אחד כותב…'
  return `${n.toLocaleString('he-IL')} אוהדים כותבים…`
}

/**
 * Keeps a remote copy of a value up to date with at most one `send` per `ms`: a change goes out at once when the
 * window is free, otherwise the latest value goes out when it ends. Nothing is sent when the value comes back to
 * what was last sent.
 */
export function createThrottle<T>(send: (v: T) => void, ms: number, initial: T) {
  let sent = initial
  let want = initial
  let last = -Infinity
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    if (Object.is(want, sent)) return
    const wait = last + ms - Date.now()
    if (wait > 0) {
      timer = setTimeout(flush, wait)
      return
    }
    sent = want
    last = Date.now()
    send(want)
  }
  return {
    set(v: T) {
      want = v
      if (!timer) flush()
    },
    sent: () => sent,
    dispose() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

/**
 * The fan's own "typing" flag: on with a keystroke, off after `idleMs` without one or on `stop()` (sent, blur, empty
 * box). Calls to `send` are throttled to one per `throttleMs`. `dispose()` turns a shown flag off at once.
 */
export function createTypingSignal(
  send: (typing: boolean) => void,
  { throttleMs = TYPING_THROTTLE_MS, idleMs = TYPING_IDLE_MS }: { throttleMs?: number; idleMs?: number } = {},
) {
  const flag = createThrottle(send, throttleMs, false)
  let idle: ReturnType<typeof setTimeout> | null = null
  const clearIdle = () => {
    if (idle) clearTimeout(idle)
    idle = null
  }
  return {
    input() {
      clearIdle()
      idle = setTimeout(() => {
        idle = null
        flag.set(false)
      }, idleMs)
      flag.set(true)
    },
    stop() {
      clearIdle()
      flag.set(false)
    },
    dispose() {
      clearIdle()
      flag.dispose()
      if (flag.sent()) send(false)
    },
  }
}
