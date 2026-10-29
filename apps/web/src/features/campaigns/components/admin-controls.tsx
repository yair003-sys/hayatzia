'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { approveVendorAction, publishCampaignAction, releaseToVendorAction, settleCampaignAction } from '../server/admin-actions'

type Result = { data?: { ok?: boolean; error?: string } | { error: string }; serverError?: string } | undefined
type T = ReturnType<typeof useTranslations>
function errOf(r: Result, t: T): string | null {
  const d = r?.data
  if (d && 'ok' in d && d.ok) return null
  return (d && 'error' in d ? d.error : null) ?? r?.serverError ?? t('actionFailed')
}

const btn = 'min-h-10 rounded-xl px-4 font-bold text-white disabled:opacity-50'

function useRun() {
  const t = useTranslations('campaigns')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<Result>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const e = errOf(await fn(), t)
    setBusy(false)
    if (e) setError(e)
    else router.refresh()
  }
  return { busy, error, run }
}

export function VendorApproveButton({ vendorId }: { vendorId: string }) {
  const t = useTranslations('campaigns')
  const { busy, error, run } = useRun()
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={busy} className={`${btn} bg-ok`} onClick={() => run(() => approveVendorAction({ vendorId }))}>
        {busy ? '…' : t('approveVendor')}
      </button>
      {error && <span className="text-xs text-live">{error}</span>}
    </span>
  )
}

export function PublishButton({ campaignId }: { campaignId: string }) {
  const t = useTranslations('campaigns')
  const { busy, error, run } = useRun()
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={busy} className={`${btn} bg-accent`} onClick={() => run(() => publishCampaignAction({ campaignId }))}>
        {busy ? '…' : t('publish')}
      </button>
      {error && <span className="text-xs text-live">{error}</span>}
    </span>
  )
}

export function SettleButton({ campaignId }: { campaignId: string }) {
  const t = useTranslations('campaigns')
  const { busy, error, run } = useRun()
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={busy} className={`${btn} bg-surface-2 !text-fg border border-line`} onClick={() => run(() => settleCampaignAction({ campaignId }))}>
        {busy ? '…' : t('closeCampaign')}
      </button>
      {error && <span className="text-xs text-live">{error}</span>}
    </span>
  )
}

/** Verify the vendor's tax invoice and release the funds to the vendor. */
export function ReleaseForm({ campaignId }: { campaignId: string }) {
  const t = useTranslations('campaigns')
  const { busy, error, run } = useRun()
  const field = 'min-h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent'
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const shekels = Number(f.get('amount'))
        run(() =>
          releaseToVendorAction({
            campaignId,
            invoiceNumber: String(f.get('number') ?? ''),
            invoiceDate: String(f.get('date') ?? ''),
            invoiceAmountAgorot: Math.round((shekels || 0) * 100),
          }),
        )
      }}
    >
      <input name="number" required placeholder={t('invoiceNumber')} className={field} />
      <input name="date" required type="date" className={field} />
      <input name="amount" required inputMode="numeric" placeholder={t('amountIls')} className={`${field} w-28`} />
      <button type="submit" disabled={busy} className={`${btn} bg-accent`}>
        {busy ? '…' : t('releaseToVendor')}
      </button>
      {error && <span className="text-xs text-live">{error}</span>}
    </form>
  )
}
