import { describe, expect, it } from 'vitest'
import { openChannel } from './channel'

function fakeClient(existing: string[]) {
  const removed: string[] = []
  const channels = existing.map((t) => ({ topic: `realtime:${t}` }))
  return {
    removed,
    getChannels: () => channels,
    removeChannel: async (c: { topic: string }) => {
      removed.push(c.topic)
      channels.splice(channels.indexOf(c), 1)
      return 'ok' as const
    },
    channel: (topic: string, opts: unknown) => ({ topic: `realtime:${topic}`, opts }),
  }
}

describe('openChannel', () => {
  it('drops a leftover channel on the same topic before opening a fresh one', async () => {
    const c = fakeClient(['room:1', 'team:mta'])
    const ch = await openChannel(c, 'room:1', { private: true })
    expect(c.removed).toEqual(['realtime:room:1'])
    expect(ch).toEqual({ topic: 'realtime:room:1', opts: { config: { private: true } } })
  })
  it('opens directly when nothing is left over', async () => {
    const c = fakeClient(['team:mta'])
    await openChannel(c, 'room:1', { private: true })
    expect(c.removed).toEqual([])
  })
})
