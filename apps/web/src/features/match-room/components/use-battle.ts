'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { openChannel } from '@/lib/supabase/channel'
import { createClient } from '@/lib/supabase/client'
import { whileVisible } from '@/lib/while-visible'
import { type Beat, type Side, pruneBeats } from '../battle'

/**
 * Live battle-bar store for one fixture. Beats (a chat message or a "push") live in a ref, so recording one does not
 * re-render the heavy chat around it; only the bar subscribes. "Push" broadcasts on its own `battle:<fixture>` channel
 * (never the chat's `match:` channel — realtime-js keeps one channel per topic), so cheers travel without a DB write.
 * Messages are fed in from the chat via `add`. Nothing is persisted: it's a right-now momentum meter.
 */
export type BattleStore = {
  /** Record a beat for a side (called for every incoming chat message). */
  add(side: Side): void
  /** This fan cheered: record locally and broadcast to the other watchers. No-op for a neutral viewer. */
  push(): void
  /** Current beats (newest-last). Read inside a ticker; prune happens on write. */
  beats(): readonly Beat[]
  subscribe(cb: () => void): () => void
}

export function useBattle(fixtureId: number, mySide: Side | null, enabled: boolean): BattleStore {
  const beatsRef = useRef<Beat[]>([])
  const listeners = useRef(new Set<() => void>())
  const sendRef = useRef<((side: Side) => void) | null>(null)

  const store = useMemo<BattleStore>(() => {
    const notify = () => {
      for (const cb of [...listeners.current]) cb()
    }
    const record = (side: Side) => {
      const now = Date.now()
      beatsRef.current = [...pruneBeats(beatsRef.current, now), { side, at: now }]
      notify()
    }
    return {
      add: record,
      push: () => {
        if (!mySide) return
        record(mySide)
        sendRef.current?.(mySide)
      },
      beats: () => beatsRef.current,
      subscribe: (cb) => {
        listeners.current.add(cb)
        return () => listeners.current.delete(cb)
      },
    }
    // A fresh store per fixture; mySide only gates push(), read live via closure is fine but keep it in deps.
  }, [fixtureId, mySide])

  useEffect(() => {
    if (!enabled) return
    const supabase = createClient()
    let cancelled = false
    let channel: RealtimeChannel | null = null
    const topic = `battle:${fixtureId}`
    // Only subscribe while the tab is visible — a backgrounded match centre needs no live cheers.
    const stop = whileVisible(() => {
      let ch: RealtimeChannel | null = null
      void (async () => {
        const opened = await openChannel(supabase, topic, { private: true })
        if (cancelled) return void supabase.removeChannel(opened)
        ch = opened
        channel = opened
        opened.on('broadcast', { event: 'PUSH' }, ({ payload }) => {
          const side = (payload as { side?: unknown })?.side
          if (side === 'h' || side === 'a') store.add(side)
        })
        await supabase.realtime.setAuth()
        if (cancelled) return
        let subscribed = false
        opened.subscribe((status) => {
          subscribed = status === 'SUBSCRIBED'
          sendRef.current = subscribed
            ? (side) => void Promise.resolve(opened.send({ type: 'broadcast', event: 'PUSH', payload: { side } })).catch(() => {})
            : null
        })
      })()
      return () => {
        sendRef.current = null
        if (ch) void supabase.removeChannel(ch)
        channel = null
      }
    })
    return () => {
      cancelled = true
      stop()
      if (channel) void supabase.removeChannel(channel)
    }
  }, [fixtureId, store, enabled])

  return store
}
