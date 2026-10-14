/**
 * Runs `fn` once a burst of calls has been quiet for `wait` ms, but never later than `maxWait` ms after the first call
 * of the burst (a steady stream of events still gets through). `cancel` drops a pending run.
 */
export function debounce(fn: () => void, wait: number, maxWait: number): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  let first: number | null = null
  const run = () => {
    timer = undefined
    first = null
    fn()
  }
  return {
    call: () => {
      const now = Date.now()
      if (first === null) first = now
      clearTimeout(timer)
      timer = setTimeout(run, Math.max(0, Math.min(wait, first + maxWait - now)))
    },
    cancel: () => {
      clearTimeout(timer)
      timer = undefined
      first = null
    },
  }
}
