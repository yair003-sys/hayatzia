import type { AuthorizeInput, AuthorizeResult, PaymentProvider, SettleResult } from './provider'

// In-memory mock of a payment provider, for local, CI and staging — and as the only provider until a real one is
// chosen and legally cleared. It holds nothing real: it hands back a reference and remembers a status in memory, so
// the campaign flow (authorize → capture / release) can be built and tested end to end without a cent moving or any
// secret. It deliberately has no network, no card fields and no persistence.

type Held = { status: 'held' | 'captured' | 'released' | 'refunded'; amountAgorot: number }

const holds = new Map<string, Held>()
let seq = 0

export const mockProvider: PaymentProvider = {
  name: 'mock',
  authorize(input: AuthorizeInput): Promise<AuthorizeResult> {
    if (!Number.isInteger(input.amountAgorot) || input.amountAgorot <= 0) {
      return Promise.resolve({ ok: false, error: 'invalid amount' })
    }
    const ref = `mock_${Date.now()}_${++seq}`
    holds.set(ref, { status: 'held', amountAgorot: input.amountAgorot })
    return Promise.resolve({ ok: true, ref })
  },
  capture(ref: string): Promise<SettleResult> {
    return Promise.resolve(move(ref, 'held', 'captured'))
  },
  release(ref: string): Promise<SettleResult> {
    return Promise.resolve(move(ref, 'held', 'released'))
  },
  refund(ref: string): Promise<SettleResult> {
    return Promise.resolve(move(ref, 'captured', 'refunded'))
  },
}

function move(ref: string, from: Held['status'], to: Held['status']): SettleResult {
  const h = holds.get(ref)
  if (!h) return { ok: false, error: 'unknown reference' }
  if (h.status !== from) return { ok: false, error: `cannot ${to} a ${h.status} hold` }
  h.status = to
  return { ok: true }
}

/** Test-only: inspect or reset the mock's memory. */
export const _mock = {
  status: (ref: string) => holds.get(ref)?.status ?? null,
  reset: () => {
    holds.clear()
    seq = 0
  },
}
