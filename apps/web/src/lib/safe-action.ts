import { createSafeActionClient } from 'next-safe-action'

/** Base client for all Server Actions: typed, Zod-validated, and never leaks raw server errors to fans. */
export const actionClient = createSafeActionClient({
  handleServerError: (e) => {
    // The code / name only: a whole error object can echo request headers (a key) into the logs.
    console.error('action failed', (e as { code?: string }).code ?? (e as Error).name ?? 'unknown')
    return 'משהו השתבש. נסה שוב'
  },
})
