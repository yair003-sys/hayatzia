'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { hasNewTail, countAfter } from '../schema'
import { isLocalId, laterMark, loadMark, saveMark, unreadDividerLabel, unreadFrom, type ReadMark } from '../essentials'

type Item = { id: string; created_at: string }

/** Smooth scrolling unless the fan asked for reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  } catch {
    return 'auto'
  }
}

/**
 * The last message whose bottom edge is on screen above the typing box. Messages are in vertical order, so a binary
 * search over their boxes is enough (no per-message observers). Only messages saved by the server carry `data-at`.
 */
function lastVisible(root: HTMLElement): ReadMark | null {
  const nodes = root.querySelectorAll<HTMLElement>('[data-mid][data-at]')
  const dock = root.querySelector('.chat-dock')
  const limit = dock ? dock.getBoundingClientRect().top : window.innerHeight
  let lo = 0
  let hi = nodes.length - 1
  let found: HTMLElement | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const node = nodes[mid]
    if (!node) break
    if (node.getBoundingClientRect().bottom <= limit + 1) {
      found = node
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const id = found?.dataset.mid
  const at = found?.dataset.at
  return id && at ? { id, at } : null
}

/** The newest message saved by the server, as a mark. */
function lastSaved(list: readonly Item[]): ReadMark | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]
    if (m && !isLocalId(m.id)) return { id: m.id, at: m.created_at }
  }
  return null
}

/**
 * Where the fan stopped reading, kept per chat on this device.
 * - Once the history is in (`ready`), the stored mark gives the unread divider (fixed for this visit) and the chat
 *   scrolls to it; with nothing new it opens at the end (`openAtEnd`) or stays put.
 * - The mark moves forward (never back) when the end of the chat is on screen, and when the fan leaves or hides the
 *   page (to the last message seen on screen).
 */
export function useReadPosition<T extends Item>({
  chat,
  items,
  ready,
  isMine,
  hasOlder = false,
  root,
  bottom,
  openAtEnd,
}: {
  chat: string
  items: readonly T[]
  ready: boolean
  isMine: (m: T) => boolean
  hasOlder?: boolean
  root: RefObject<HTMLElement | null>
  bottom: RefObject<HTMLElement | null>
  openAtEnd: boolean
}) {
  const [divider, setDivider] = useState<{ id: string; label: string } | null>(null)
  const [entered, setEntered] = useState(false)
  const latest = useRef({ items, isMine, hasOlder })
  const seen = useRef<ReadMark | null>(null)
  const atEnd = useRef(false)
  const enteredRef = useRef(false)

  useEffect(() => {
    latest.current = { items, isMine, hasOlder }
  })

  // Entering: read the stored mark once, place the divider.
  useEffect(() => {
    if (!ready || entered) return
    const t = setTimeout(() => {
      const { items: list, isMine: mine, hasOlder: older } = latest.current
      const saved = list.filter((m) => !isLocalId(m.id))
      const u = unreadFrom(saved, loadMark(chat), mine)
      const first = u.index >= 0 ? saved[u.index] : undefined
      setDivider(first ? { id: first.id, label: unreadDividerLabel(u.count, u.more && older) } : null)
      setEntered(true)
    }, 0)
    return () => clearTimeout(t)
  }, [ready, entered, chat])

  // Then scroll once: to the divider, or to the end.
  useEffect(() => {
    if (!entered || enteredRef.current) return
    enteredRef.current = true
    const el = root.current?.querySelector('[data-unread-divider]')
    if (el) {
      el.scrollIntoView({ block: 'start' })
    } else if (openAtEnd) {
      bottom.current?.scrollIntoView({ block: 'end' })
    }
    // Whatever is on screen now counts as seen.
    if (root.current) seen.current = laterMark(seen.current, lastVisible(root.current))
  }, [entered, root, bottom, openAtEnd])

  // The end of the chat on screen: everything was read.
  useEffect(() => {
    const el = bottom.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        atEnd.current = e?.isIntersecting ?? false
        const last = lastSaved(latest.current.items)
        if (atEnd.current && enteredRef.current && last) {
          seen.current = laterMark(seen.current, last)
          saveMark(chat, last)
        }
      },
      { rootMargin: '0px 0px 160px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [bottom, chat])

  // New messages while at the end are read too.
  const lastId = items.at(-1)?.id
  useEffect(() => {
    if (!atEnd.current || !enteredRef.current) return
    const last = lastSaved(latest.current.items)
    if (!last) return
    seen.current = laterMark(seen.current, last)
    saveMark(chat, last)
  }, [lastId, chat])

  // Scrolling records the last message seen; leaving or hiding the page saves it.
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      if (!enteredRef.current || !root.current) return
      seen.current = laterMark(seen.current, lastVisible(root.current))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const flush = () => {
      if (seen.current) saveMark(chat, seen.current)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    // Capture: the page or any scrolling ancestor of the chat.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
  }, [chat, root])

  return { divider, entered }
}

/**
 * The "go down" button's state for a chat: whether the end is on screen, how many messages arrived while the fan
 * was scrolled up, and following new messages at the end (or right after the fan sent one).
 */
export function useFollowEnd<T extends { id: string }>(
  items: readonly T[],
  bottom: RefObject<HTMLElement | null>,
  {
    enabled,
    initialAtBottom = true,
    extraCount = 0,
  }: {
    /** Off until the chat has opened at its place (the read position scrolls first). */
    enabled: boolean
    /** A chat under other content (the match page) starts "not at the end", so nothing scrolls before the observer. */
    initialAtBottom?: boolean
    /** Extra items in the stream (polls): a new one is followed like a new message. */
    extraCount?: number
  },
) {
  const [atBottom, setAtBottom] = useState(initialAtBottom)
  const atBottomRef = useRef(initialAtBottom)
  const shown = useRef(items)
  const shownExtra = useRef(extraCount)
  const followMine = useRef(false)
  // The newest message the fan has seen at the end; the badge counts what came after it. Starts at the newest message
  // on screen when the chat opens (a room that opens scrolled up still counts what arrives later).
  const [seenId, setSeenId] = useState<string | null>(() => items.at(-1)?.id ?? null)

  useEffect(() => {
    const el = bottom.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        const v = e?.isIntersecting ?? true
        atBottomRef.current = v
        setAtBottom(v)
      },
      { rootMargin: '0px 0px 160px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [bottom])

  useEffect(() => {
    const grew = hasNewTail(shown.current, items) || extraCount > shownExtra.current
    if (enabled && grew && (atBottomRef.current || followMine.current)) {
      bottom.current?.scrollIntoView({ block: 'end', behavior: scrollBehavior() })
    }
    followMine.current = false
    shown.current = items
    shownExtra.current = extraCount
  }, [items, extraCount, enabled, bottom])

  const last = items.at(-1)?.id ?? null
  useEffect(() => {
    // At the end: everything is seen. Not yet anything (a history that loads later): its newest message.
    if (!last || (!atBottom && seenId !== null)) return
    const t = setTimeout(() => setSeenId((cur) => (atBottom || cur === null ? last : cur)), 0)
    return () => clearTimeout(t)
  }, [atBottom, last, seenId])

  return {
    atBottom,
    unread: atBottom ? 0 : countAfter(items, seenId),
    toEnd: () => bottom.current?.scrollIntoView({ block: 'end', behavior: scrollBehavior() }),
    /** Call before adding my own message: the chat follows it even when scrolled up. */
    followNext: () => {
      followMine.current = true
    },
  }
}
