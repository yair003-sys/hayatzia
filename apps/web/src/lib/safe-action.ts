import { createSafeActionClient } from 'next-safe-action'

/** Base client for all Server Actions: typed, Zod-validated, and never leaks raw server errors to fans. */
export const actionClient = createSafeActionClient({
  handleServerError: (e) => {
    console.error(e)
    return 'משהו השתבש. נסה שוב'
  },
})
