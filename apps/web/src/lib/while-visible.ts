/**
 * Runs `start` while the page is visible and its returned stop function when the page is hidden (a background tab,
 * a phone in a pocket), again on every change. Returns a cleanup that stops listening and stops `start`'s work.
 */
export function whileVisible(start: () => () => void, doc: Document = document): () => void {
  let stop: (() => void) | null = null
  const on = () => {
    if (!stop) stop = start()
  }
  const off = () => {
    const s = stop
    stop = null
    s?.()
  }
  const onChange = () => {
    if (doc.visibilityState === 'hidden') off()
    else on()
  }
  if (doc.visibilityState !== 'hidden') on()
  doc.addEventListener('visibilitychange', onChange)
  return () => {
    doc.removeEventListener('visibilitychange', onChange)
    off()
  }
}
