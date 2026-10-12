// The browser Supabase client is a singleton, and realtime-js hands back an existing channel for the same topic
// until the server acknowledges its leave. A page that mounts while the previous page's channel on that topic is
// still leaving would get the dying channel and stay silent. So: drop any leftover first, then open a fresh one.

type ChannelLike = { topic: string }
type ClientLike<C extends ChannelLike, O> = {
  getChannels(): C[]
  removeChannel(c: C): Promise<unknown>
  channel(topic: string, opts: { config: O }): C
}

export async function openChannel<C extends ChannelLike, O>(client: ClientLike<C, O>, topic: string, config: O): Promise<C> {
  const stale = client.getChannels().find((c) => c.topic === `realtime:${topic}`)
  if (stale) await client.removeChannel(stale)
  return client.channel(topic, { config })
}
