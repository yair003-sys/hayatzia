import Link from 'next/link'
import { supabaseConfig } from '@/lib/supabase/config'
import { TEAMS } from '@/features/teams/data'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { Brand } from '@/components/brand'
import { BrandBackdrop } from '@/components/brand-backdrop'
import { FirstRunIntro } from '@/features/first-run/components/first-run-intro'
import { DeletedNotice } from '@/features/account/components/deleted-notice'
import { LegalLinks } from '@/features/legal/components/legal-links'
import { NOT_AFFILIATED } from '@/lib/legal'
import { Suspense } from 'react'

export default function WelcomePage() {
  const enabled = supabaseConfig() !== null
  return (
    <main className="relative isolate mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 pt-16 pb-10">
      <BrandBackdrop />
      <FirstRunIntro then="login" />
      <header>
        <Brand className="text-2xl" size={36} />
      </header>

      <Suspense fallback={null}>
        <DeletedNotice />
      </Suspense>

      <section className="space-y-4">
        <p className="text-xs font-medium tracking-[0.08em] text-muted">
          <span className="t-num text-ok">26/27</span> · ליגת העל
        </p>
        <h1 className="text-[2.6rem] leading-[1.12] font-semibold tracking-[-0.015em] text-balance">
          רק אוהדים אמיתיים
          <span className="block font-light text-muted">הבית של האוהדים</span>
        </h1>
        <p className="text-base leading-relaxed text-muted">קהילה פרטית לכל קבוצה. כל אוהד מאומת, וקבוצה אחת לכל החיים.</p>
        <ul className="flex flex-wrap gap-1.5 pt-2" aria-label="קבוצות ליגת העל">
          {TEAMS.map((t) => (
            <li key={t.id} title={t.name}>
              <TeamScarf team={t} />
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-3">
        <Link
          href={enabled ? '/login' : '/stand'}
          className="block rounded-lg bg-ok py-4 text-center text-lg font-bold text-canvas shadow-[0_8px_30px_rgb(0_255_102/0.3)] transition-transform active:scale-[0.98]"
        >
          כניסה ל-onefan
        </Link>
        <p className="text-center text-xs text-dim">גרסה חדשה בבנייה.</p>
        <p className="text-center text-xs text-dim">{NOT_AFFILIATED}</p>
        <LegalLinks />
      </div>
    </main>
  )
}
