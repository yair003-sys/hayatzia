'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moneyLabel } from '../schema'
import { contributeAction } from '../server/actions'

const PRESETS = [1800, 3600, 10000] // minor units (e.g. 18 / 36 / 100 of the campaign's currency)

/** The backing box on a campaign page: pick an amount and place a hold. Shows plainly that the money is only held,
 * released if the goal is missed, and that onefan never sees the card or keeps the money. */
export function ContributeBox({ campaignId, currency }: { campaignId: string; currency: string }) {
  const router = useRouter()
  const [amount, setAmount] = useState(3600)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = custom ? Math.round(Number(custom) * 100) : amount
  const valid = Number.isFinite(chosen) && chosen >= 100

  async function give() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const r = await contributeAction({ campaignId, amountAgorot: chosen, anonymous: false })
    setBusy(false)
    const d = r?.data
    if (d && 'ok' in d) {
      setDone(true)
      router.refresh()
    } else {
      setError((d && 'error' in d ? d.error : null) ?? r?.serverError ?? 'משהו השתבש. נסו שוב')
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/10 p-4 text-sm text-ok">
        התרומה נקלטה 🎉 הסכום <b>מוחזק</b> בכרטיס וייגבה רק אם הקמפיין יגיע ליעד. תודה!
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="mb-3 text-sm font-extrabold">בחרו סכום</p>
      <div className="flex flex-wrap gap-2.5">
        {PRESETS.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={!custom && amount === a}
            onClick={() => {
              setCustom('')
              setAmount(a)
            }}
            className={`min-w-[68px] flex-1 rounded-xl border px-3 py-3 text-[15px] font-extrabold transition-colors ${
              !custom && amount === a ? 'border-accent bg-accent/15 text-accent-text' : 'border-line bg-surface-2'
            }`}
          >
            {moneyLabel(a, currency)}
          </button>
        ))}
        <input
          inputMode="numeric"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="סכום אחר"
          aria-label="סכום אחר"
          className="min-w-[90px] flex-1 rounded-xl border border-line bg-surface-2 px-3 py-3 text-center text-[15px] font-extrabold outline-none focus:border-accent"
        />
      </div>

      <button
        type="button"
        onClick={give}
        disabled={!valid || busy}
        className="mt-4 flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-extrabold text-white disabled:opacity-50"
      >
        {busy ? 'רגע…' : valid ? `תרמו ${moneyLabel(chosen, currency)} ←` : 'בחרו סכום'}
      </button>
      {error && <p className="mt-2 text-center text-[13px] text-live">{error}</p>}

      <p className="mt-3 rounded-xl border border-ok/25 bg-ok/10 p-3 text-[12px] leading-relaxed text-muted">
        🔒 התשלום מאובטח אצל ספק סליקה. onefan לא רואה את פרטי הכרטיס ולא מחזיקה את הכסף.
        <br />↩︎ הכל-או-כלום: הסכום רק מוחזק — אם היעד לא יושג, לא תחויבו בכלום.
      </p>
    </div>
  )
}
