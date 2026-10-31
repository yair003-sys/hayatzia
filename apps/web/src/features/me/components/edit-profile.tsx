'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil } from 'lucide-react'
import { updateNickAction } from '../server/actions'

const MIN = 2
const MAX = 20

/** "ערוך פרופיל": a small sheet to change the nickname (the name other fans see). The club is locked for life and the
 *  photos have their own camera buttons, so the nick is the one thing to edit here. */
export function EditProfile({ nick }: { nick: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(nick)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = () => {
    setValue(nick)
    setError(null)
    setOpen(true)
  }

  const save = async () => {
    const v = value.trim()
    if (v.length < MIN || v.length > MAX) {
      setError(`הכינוי צריך להיות בין ${MIN} ל-${MAX} תווים`)
      return
    }
    if (v === nick) {
      setOpen(false)
      return
    }
    setBusy(true)
    setError(null)
    const r = await updateNickAction({ nick: v })
    setBusy(false)
    if (r?.data && 'ok' in r.data) {
      setOpen(false)
      router.refresh()
    } else {
      setError((r?.data && 'error' in r.data && r.data.error) || 'השמירה נכשלה. נסה שוב')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="inline-flex min-h-[42px] flex-[1.4] items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold"
      >
        <Pencil className="size-4" aria-hidden="true" />
        ערוך פרופיל
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] grid place-items-end px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:place-items-center"
          style={{ background: 'rgb(0 0 0 / 0.55)' }}
          role="dialog"
          aria-modal="true"
          aria-label="עריכת פרופיל"
          onClick={() => !busy && setOpen(false)}
        >
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black">עריכת פרופיל</h3>

            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-muted">הכינוי שלך</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={MAX}
                autoFocus
                dir="auto"
                className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-base font-bold outline-none focus:border-[rgb(var(--club-rgb))]"
                aria-label="הכינוי שלך"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save()
                }}
              />
              <span className="block text-end text-xs text-dim">
                <span className="t-num">{value.trim().length}</span>/{MAX}
              </span>
            </label>

            <p className="text-xs text-dim">הקבוצה נעולה לתמיד. את תמונת הפרופיל והנושא משנים ישירות על הכרטיס.</p>

            {error && <p className="text-sm font-bold" style={{ color: 'rgb(255 61 87)' }}>{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:opacity-60"
                style={{ background: 'rgb(var(--club-rgb))', color: 'var(--club-on)' }}
              >
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                שמירה
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-bold"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
