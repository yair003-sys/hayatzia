'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { openThreadAction } from '@/features/dm/server/actions'

/** "שלח הודעה" on another fan's profile: opens (or reuses) the private conversation with them and goes to it. The
 *  server action enforces every rule (the fan's request setting, blocks, bans, daily cap) and redirects on success;
 *  only a refusal comes back here, shown as a plain message. */
export function SendMessage({ otherId }: { otherId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onClick = async () => {
    setBusy(true)
    setError(null)
    const r = await openThreadAction({ otherId })
    // On success the action redirects to the thread; only a refusal returns a value here.
    if (r?.data && 'error' in r.data && r.data.error) {
      setError(r.data.error)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:opacity-60"
        style={{ background: 'rgb(var(--club-rgb))', color: 'var(--club-on)' }}
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        {busy ? 'פותח שיחה…' : 'שלח הודעה'}
      </button>
      {error && (
        <p role="alert" className="text-center text-sm font-bold" style={{ color: 'rgb(255 61 87)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
