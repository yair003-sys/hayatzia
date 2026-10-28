import Link from 'next/link'
import { CATEGORY_HE, type Category, daysLeft, moneyLabel, progressPct } from '../schema'
import type { Campaign } from '../server/queries'

const clock = () => Date.now()

/** A campaign in the discovery list: cause, progress toward the goal, and time left. Links to the full page. */
export function CampaignCard({ campaign: c }: { campaign: Campaign }) {
  const pct = progressPct(c.raised_agorot, c.goal_agorot)
  const left = daysLeft(new Date(c.deadline).getTime(), clock())
  return (
    <Link
      href={`/campaigns/${c.id}`}
      className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold text-muted">
          {CATEGORY_HE[c.category as Category] ?? 'אחר'}
        </span>
        {c.beneficiary_verified && <span className="text-[11px] font-extrabold text-ok">✔ מאומת</span>}
      </div>
      <h3 className="mt-2 text-[15px] font-extrabold leading-snug">{c.title}</h3>
      <p className="mt-1 text-[12px] text-muted">למען: {c.beneficiary_name}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <i className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px] text-muted">
        <span>
          <b className="t-num text-fg">{moneyLabel(c.raised_agorot, c.currency)}</b> מתוך {moneyLabel(c.goal_agorot, c.currency)}
        </span>
        <span>{left > 0 ? `נותרו ${left} ימים` : 'הסתיים'}</span>
      </div>
    </Link>
  )
}
