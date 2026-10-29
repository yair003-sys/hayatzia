'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CATEGORIES, CATEGORY_HE, type BeneficiaryKind, type Category } from '../schema'
import { createCampaignAction } from '../server/actions'

type VendorOption = { id: string; name: string }

/** Opening a campaign. On submit it is created as "in review" — a human checks the cause and the vendor before it
 * goes live — so the form ends with that message, not a live campaign. Vendor Direct: when an approved vendor is
 * picked, it is the money's destination; otherwise a free-text beneficiary is the fallback until the roster fills. */
export function CreateForm({ vendors }: { vendors: VendorOption[] }) {
  const t = useTranslations('campaigns')
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
      setError(t('fillGoalDate'))
      return
    }
    const vendorId = String(f.get('vendorId') ?? '')
    const vendor = vendors.find((v) => v.id === vendorId)
    const item = String(f.get('item') ?? '').trim()
    // A chosen vendor is the money's destination; otherwise fall back to the free-text beneficiary.
    const beneficiaryName = vendor ? vendor.name : String(f.get('beneficiaryName') ?? '').trim()
    if (!beneficiaryName) {
      setError(t('pickVendorOrBeneficiary'))
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
      beneficiaryKind: vendor ? 'business' : (String(f.get('beneficiaryKind') ?? 'amuta') as BeneficiaryKind),
      beneficiaryName,
      vendorId: vendor ? vendor.id : undefined,
      itemDescription: item || undefined,
      deadline: new Date(`${dateStr}T12:00:00.000Z`).toISOString(),
    })
    setBusy(false)
    const d = r?.data
    if (d && 'id' in d) setSent(true)
    else setError((d && 'error' in d ? d.error : null) ?? r?.serverError ?? t('openFailed'))
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/10 p-5 text-sm leading-relaxed text-ok">
        {t('sentForReview')}
      </div>
    )
  }

  const field = 'w-full rounded-xl border border-line bg-surface-2 px-3 py-3 text-[15px] outline-none focus:border-accent'
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">{t('nameLabel')}</span>
        <input name="title" required maxLength={90} className={field} placeholder={t('namePlaceholder')} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">{t('categoryLabel')}</span>
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
          <span className="text-[13px] font-bold text-muted">{t('goalLabel')}</span>
          <input name="goal" required inputMode="numeric" className={field} placeholder="20000" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-muted">{t('deadlineLabel')}</span>
          <input name="deadline" required type="date" className={field} />
        </label>
      </div>
      {vendors.length > 0 && (
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-muted">{t('vendorLabel')}</span>
          <select name="vendorId" className={field} defaultValue="">
            <option value="">{t('pickVendorOption')}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">{t('itemLabel')}</span>
        <input name="item" maxLength={200} className={field} placeholder={t('itemPlaceholder')} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">{t('beneficiaryLabel')}</span>
        <input name="beneficiaryName" maxLength={120} className={field} placeholder={t('beneficiaryPlaceholder')} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">{t('kindLabel')}</span>
        <select name="beneficiaryKind" className={field} defaultValue="business">
          <option value="business">{t('kindBusiness')}</option>
          <option value="amuta">{t('kindAmuta')}</option>
          <option value="individual">{t('kindIndividual')}</option>
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-muted">{t('descriptionLabel')}</span>
        <textarea name="description" rows={4} maxLength={4000} className={field} placeholder={t('descriptionPlaceholder')} />
      </label>

      <p className="rounded-xl border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">
        {t('reviewNote')}
      </p>
      <button
        type="submit"
        disabled={busy}
        className="flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-extrabold text-white disabled:opacity-50"
      >
        {busy ? t('sending') : t('submitForReview')}
      </button>
      {error && <p className="text-center text-[13px] text-live">{error}</p>}
    </form>
  )
}
