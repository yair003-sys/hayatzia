import { describe, expect, it, vi } from 'vitest'
import { listenPrivate } from './shared-channel'

type Handler = (m: { event: string; payload: unknown }) => void

/** A fake browser client that behaves like realtime-js 2.117: channel() returns the existing channel for a topic. */
function fakeClient() {
  const log: string[] = []
  let channels: FakeChannel[] = []
  let removeGate: Promise<void> = Promise.resolve()
  const faults = { channel: 0, remove: 0 }
  class FakeChannel {
    handlers: Handler[] = []
    subscribed = false
    constructor(readonly topic: string, readonly opts: unknown) {}
    on(_type: 'broadcast', _filter: { event: string }, cb: Handler) {
      this.handlers.push(cb)
      return this
    }
    subscribe() {
      this.subscribed = true
      log.push(`subscribe ${this.topic}`)
      return this
    }
    emit(event: string, payload: unknown) {
      for (const h of this.handlers) h({ event, payload })
    }
  }
  const client = {
    log,
    channels: () => channels,
    holdRemovals() {
      let release!: () => void
      removeGate = new Promise((r) => (release = r))
      return release
    },
    realtime: { setAuth: async () => {} },
    getChannels: () => channels,
    faults,
    channel(topic: string, opts: unknown) {
      if (faults.channel > 0) {
        faults.channel -= 1
        throw new Error('socket down')
      }
      const existing = channels.find((c) => c.topic === `realtime:${topic}`)
      if (existing) return existing
      const c = new FakeChannel(`realtime:${topic}`, opts)
      channels.push(c)
      log.push(`open ${c.topic}`)
      return c
    },
    async removeChannel(c: FakeChannel) {
      log.push(`remove ${c.topic}`)
      await removeGate
      if (faults.remove > 0) {
        faults.remove -= 1
        throw new Error('leave failed')
      }
      channels = channels.filter((x) => x !== c)
      return 'ok' as const
    },
  }
  return client
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('listenPrivate', () => {
  it('opens one private channel per topic and delivers every broadcast to every listener', async () => {
    const c = fakeClient()
    const a: string[] = []
    const b: string[] = []
    listenPrivate(c, 'inbox:me', (m) => a.push(m.event))
    listenPrivate(c, 'inbox:me', (m) => b.push(m.event))
    await tick()
    expect(c.log).toEqual(['open realtime:inbox:me', 'subscribe realtime:inbox:me'])
    expect(c.channels()[0]?.opts).toEqual({ config: { private: true } })
    c.channels()[0]?.emit('message', {})
    c.channels()[0]?.emit('invite', {})
    expect(a).toEqual(['message', 'invite'])
    expect(b).toEqual(['message', 'invite'])
  })

  it('one listener leaving keeps the channel for the other; the last one closes it', async () => {
    const c = fakeClient()
    const b: string[] = []
    const offA = listenPrivate(c, 'inbox:me', () => {})
    const offB = listenPrivate(c, 'inbox:me', (m) => b.push(m.event))
    await tick()
    offA()
    await tick()
    expect(c.log).not.toContain('remove realtime:inbox:me')
    c.channels()[0]?.emit('message', {})
    expect(b).toEqual(['message'])
    offB()
    await tick()
    expect(c.log.at(-1)).toBe('remove realtime:inbox:me')
    expect(c.channels()).toEqual([])
  })

  it('a listener that left gets nothing more', async () => {
    const c = fakeClient()
    const a: string[] = []
    const offA = listenPrivate(c, 'alerts', (m) => a.push(m.event))
    listenPrivate(c, 'alerts', () => {})
    await tick()
    offA()
    c.channels()[0]?.emit('alert', {})
    expect(a).toEqual([])
  })

  it('a new listener while the old channel is still leaving waits and gets a fresh channel', async () => {
    const c = fakeClient()
    const release = c.holdRemovals()
    const off = listenPrivate(c, 'inbox:me', () => {})
    await tick()
    off()
    const got: string[] = []
    listenPrivate(c, 'inbox:me', (m) => got.push(m.event))
    await tick()
    expect(c.log.filter((l) => l.startsWith('open'))).toHaveLength(1) // still waiting for the leave
    release()
    await tick()
    await tick()
    expect(c.log.filter((l) => l.startsWith('open'))).toHaveLength(2)
    const fresh = c.channels().at(-1)
    expect(fresh?.subscribed).toBe(true)
    fresh?.emit('message', {})
    expect(got).toEqual(['message'])
  })

  it('leaving before the channel was set up never subscribes and still cleans up', async () => {
    const c = fakeClient()
    const off = listenPrivate(c, 'alerts', () => {})
    off()
    await tick()
    await tick()
    expect(c.log).not.toContain('subscribe realtime:alerts')
    expect(c.channels()).toEqual([])
  })

  it('one throwing listener does not starve the others', async () => {
    const c = fakeClient()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const got: string[] = []
    listenPrivate(c, 'alerts', () => {
      throw new Error('boom')
    })
    listenPrivate(c, 'alerts', (m) => got.push(m.event))
    await tick()
    c.channels()[0]?.emit('alert', { secret: 'x' })
    expect(got).toEqual(['alert'])
    expect(warn).toHaveBeenCalledWith('realtime listener failed on alerts')
    warn.mockRestore()
  })

  it('a failed open settles quietly and the next listener starts over', async () => {
    const c = fakeClient()
    c.faults.channel = 1
    const off = listenPrivate(c, 'inbox:me', () => {})
    await tick()
    expect(c.channels()).toEqual([])
    off() // releasing a listener whose open failed is harmless
    await tick()
    const got: string[] = []
    listenPrivate(c, 'inbox:me', (m) => got.push(m.event))
    await tick()
    expect(c.channels()).toHaveLength(1)
    expect(c.channels()[0]?.subscribed).toBe(true)
    c.channels()[0]?.emit('message', {})
    expect(got).toEqual(['message'])
  })

  it('a failed leave does not block the next open', async () => {
    const c = fakeClient()
    c.faults.remove = 1
    const off = listenPrivate(c, 'alerts', () => {})
    await tick()
    off()
    await tick()
    listenPrivate(c, 'alerts', () => {})
    await tick()
    await tick()
    // the leftover from the failed leave is dropped, then a fresh channel is subscribed
    expect(c.channels()).toHaveLength(1)
    expect(c.channels()[0]?.subscribed).toBe(true)
  })
})
