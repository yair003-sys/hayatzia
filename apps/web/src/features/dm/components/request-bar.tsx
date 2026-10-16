'use client'

import type { RequestState } from '../schema'

/**
 * A message request, seen by the fan who received it (owner, 2026-10-16): the sender's first message is shown, and at
 * the bottom "אשר והמשך שיחה" or "חסום". No report with message content (messages are end-to-end encrypted).
 */
export function RequestBar({
  state,
  nick,
  onAccept,
  onBlock,
  pending = false,
}: {
  state: RequestState
  nick: string
  onAccept: () => void
  onBlock: () => void
  pending?: boolean
}) {
  if (state !== 'decide') return null
  return (
    <div className="sticky bottom-[calc(var(--tabbar-space)+0.5rem)] z-10 space-y-2 rounded-2xl border border-line bg-surface p-3">
      <p className="text-sm">{nick} רוצה לשלוח לך הודעה. רק אחרי שתאשר הוא יוכל להמשיך לכתוב.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onAccept} disabled={pending} className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-40">
          אשר והמשך שיחה
        </button>
        <button type="button" onClick={onBlock} disabled={pending} className="min-h-11 rounded-lg border border-line px-5 text-live disabled:opacity-40">
          חסום
        </button>
      </div>
    </div>
  )
}

/** The opener after the first message: writing waits until the other fan accepts. */
export function WaitingNote({ state }: { state: RequestState }) {
  if (state !== 'waiting') return null
  return (
    <p role="status" className="rounded-lg bg-surface-2 p-3 text-center text-sm text-muted">
      ההודעה נשלחה. אפשר לכתוב שוב כשיאשרו
    </p>
  )
}
