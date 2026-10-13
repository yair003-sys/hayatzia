// Several components may listen to the same private topic at once (the in-app banner and the inbox both listen to
// `inbox:<me>`). realtime-js keeps one channel per topic on the singleton browser client: `channel()` with a known
// topic returns the existing channel, and `removeChannel()` from either user would silently kill it for the other.
// So listeners of a topic share one channel here, counted; the channel is removed when the last listener leaves,
// and a listener arriving while that leave is in flight waits for it and opens a fresh channel.
import { openChannel } from './channel'

export type BroadcastMessage = { event: string; payload: unknown }
type Listener = (m: BroadcastMessage) => void

type ChannelLike = {
  topic: string
  on(type: 'broadcast', filter: { event: string }, cb: (m: BroadcastMessage) => void): unknown
  subscribe(): unknown
}
type ClientLike<C extends ChannelLike> = {
  getChannels(): C[]
  channel(topic: string, opts: { config: { private: true } }): C
  removeChannel(c: C): Promise<unknown>
  realtime: { setAuth(): Promise<unknown> }
}

type Entry = { listeners: Set<Listener>; open: Promise<ChannelLike | null> }

const byClient = new WeakMap<object, { entries: Map<string, Entry>; leaving: Map<string, Promise<unknown>> }>()

/** Listens to every broadcast on a private topic. Returns a function that stops listening (sync, safe to call twice). */
export function listenPrivate<C extends ChannelLike>(client: ClientLike<C>, topic: string, listener: Listener): () => void {
  let state = byClient.get(client)
  if (!state) {
    state = { entries: new Map(), leaving: new Map() }
    byClient.set(client, state)
  }
  const { entries, leaving } = state

  let entry = entries.get(topic)
  if (!entry) {
    const listeners = new Set<Listener>()
    const created: Entry = { listeners, open: Promise.resolve(null) }
    created.open = (async () => {
      try {
        await leaving.get(topic)
        if (listeners.size === 0) return null
        // Only this helper opens these topics, so a channel still listed here is a leftover whose leave timed out.
        const ch = await openChannel(client, topic, { private: true as const })
        if (listeners.size === 0) {
          await client.removeChannel(ch)
          return null
        }
        ch.on('broadcast', { event: '*' }, (m) => {
          for (const l of [...listeners]) {
            try {
              l(m)
            } catch {
              // one failing listener must not starve the others (nothing from the payload is logged)
              console.warn(`realtime listener failed on ${topic}`)
            }
          }
        })
        await client.realtime.setAuth().catch(() => {})
        if (listeners.size > 0) ch.subscribe()
        return ch
      } catch {
        // Could not open: forget this entry so the next listener starts over.
        if (entries.get(topic) === created) entries.delete(topic)
        return null
      }
    })()
    entry = created
    entries.set(topic, entry)
  }
  const mine = entry
  mine.listeners.add(listener)

  return () => {
    if (!mine.listeners.delete(listener) || mine.listeners.size > 0) return
    if (entries.get(topic) === mine) entries.delete(topic)
    const gone: Promise<unknown> = mine.open
      .then((ch) => (ch ? client.removeChannel(ch as C) : null))
      .catch(() => null) // a failed leave is not fatal: the next open drops any leftover channel
      .finally(() => {
        if (leaving.get(topic) === gone) leaving.delete(topic)
      })
    leaving.set(topic, gone)
  }
}
