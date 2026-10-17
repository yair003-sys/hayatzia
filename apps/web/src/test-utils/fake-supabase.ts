// TESTS ONLY: a stand-in for the supabase-js client in unit tests of the query helpers. Every query builder method
// returns the builder; awaiting it (or .single() / .maybeSingle()) gives the result configured for that table.
// Storage signing and RPCs answer from the same configuration. Never talks to a network.

export type FakeResult = { data: unknown; error: unknown; count?: number | null }

export type FakeConfig = {
  tables?: Record<string, FakeResult>
  rpc?: Record<string, FakeResult>
  signed?: FakeResult
  /** The signed-in fan's id (auth.getClaims), or null. */
  me?: string | null
}

export const ok = (data: unknown, count?: number): FakeResult => ({ data, error: null, count: count ?? null })
/** What PostgREST answers when its pool is exhausted (the load test's 504). */
export const failed: FakeResult = { data: null, error: { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' }, count: null }

export function fakeSupabase(config: FakeConfig) {
  const resultOf = (table: string): FakeResult => config.tables?.[table] ?? ok([], 0)
  const builder = (table: string): unknown => {
    const self: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            return (onOk: (v: FakeResult) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(resultOf(table)).then(onOk, onErr)
          }
          if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(resultOf(table))
          return () => self
        },
      },
    )
    return self
  }
  return {
    from: (table: string) => builder(table),
    rpc: async (fn: string) => config.rpc?.[fn] ?? ok(null),
    storage: { from: () => ({ createSignedUrls: async () => config.signed ?? ok([]) }) },
    auth: { getClaims: async () => ({ data: config.me ? { claims: { sub: config.me } } : null, error: null }) },
  }
}
