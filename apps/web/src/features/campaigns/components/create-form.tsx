'use client'

import { useState } from 'react'
import { CATEGORIES, CATEGORY_HE, type BeneficiaryKind, type Category } from '../schema'
import { createCampaignAction } from '../server/actions'

const KIND_HE: Record<BeneficiaryKind, string> = { amuta: 'עמותה רשומה', business: 'עסק מורשה', individual: 'אדם פרטי' }

/** Opening a campaign. On submit it is created as "in review" — a human checks the cause and the beneficiary before
 * it goes live — so the form ends with that message, not a live campaign. */
export function CreateForm() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const f = new FormData(e.currentTarget)
    const shekels = Number(f.get('goal'))
    const dateStr = String(f.get('deadline'))
    if (!shekels || shekels < 1 || !dateStr) {
      setError('מלאו יעד ותאריך סיום תקינים')
      return
    }
    setBusy(true)
    setError(null)
    const r = await createCampaignAction({
      title: String(f.get('title') ?? ''),
      description: String(f.get('description') ?? ''),
      category: String(f.get('category') ?? 'other') as Category,
      goalAgorot: Math.round(shekels * 100),
      fundingModel: 'all_or_nothing',
      beneficiaryKind: String(f.get('beneficiaryKind') ?? 'amuta') as BeneficiaryKind,
      beneficiaryName: String(f.get('beneficiaryName') ?? ''),
      deadline: new Date(`${dateStr}T12:00:00.000Z`).toISOString(),
    })
    setBusy(false)
    const d = r?.data
    if (d && 'id' in d) setSent(true)
    else setError((d && 'error' in d ? d.error : null) ?? r?.serverError ?? 'הפתיחה נכשלה. בדקו את הפרטים ונסו שוב')
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/10 p-5 text-sm leading-relaxed text-ok">
        הקמפיין נשלח לבדיקה ✔ נבדוק את המטרה ואת המוטב, ומיד לאחר מכן הוא יעלה לאוויר ואפשר יהיה לתרום.
      </div>
    )
  }

  const field = 'w-full rounded-xl border border-line bg-surface-2 px-3 py-3 text-[15px] outline-none focus:border-accent'
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">שם הקמפיין</span>
        <input name="title" required maxLength={90} className={field} placeholder="למשל: טיפו ענק לדרבי" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">קטגוריה</span>
        <select name="category" className={field} defaultValue="tifo">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_HE[c as Category]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-muted">יעד (₪)</span>
          <input name="goal" required inputMode="numeric" className={field} placeholder="20000" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-muted">תאריך סיום</span>
          <input name="deadline" required type="date" className={field} />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">מי מקבל את הכסף (המוטב)</span>
        <input name="beneficiaryName" required maxLength={120} className={field} placeholder="שם העמותה / העסק" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">סוג המוטב</span>
        <select name="beneficiaryKind" className={field} defaultValue="amuta">
          <option value="amuta">{KIND_HE.amuta}</option>
          <option value="business">{KIND_HE.business}</option>
          <option value="individual">{KIND_HE.individual}</option>
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">תיאור (לא חובה)</span>
        <textarea name="description" rows={4} maxLength={4000} className={field} placeholder="ספרו על המטרה…" />
      </label>

      <p className="rounded-xl border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">
        לאחר השליחה הקמפיין עובר בדיקה קצרה (מטרה + מוטב) ואז עולה לאוויר. הכסף עובר ישירות למוטב דרך ספק סליקה — onefan לא מחזיקה אותו.
      </p>
      <button
        type="submit"
        disabled={busy}
        className="flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-extrabold text-white disabled:opacity-50"
      >
        {busy ? 'שולח…' : 'שלחו לבדיקה ←'}
      </button>
      {error && <p className="text-center text-[13px] text-live">{error}</p>}
    </form>
  )
}
