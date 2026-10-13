import type { ReactNode } from 'react'
import type { IntroPage } from '../schema'

// Illustrations for the intro pages. Everything shown is made up for illustration and labelled so on the page.

const Badge = ({ className, children }: { className: string; children: ReactNode }) => <span className={`fr-badge ${className}`}>{children}</span>

export function IntroArt({ id }: { id: IntroPage['id'] }) {
  switch (id) {
    case 'home':
      return (
        <div className="fr-tile">
          <span className="fr-scarf" />
          <Badge className="top-2 -right-4">אוהד מאומת</Badge>
          <Badge className="bottom-3.5 -left-5">קבוצה אחת לכל החיים</Badge>
        </div>
      )
    case 'rival':
      return (
        <div className="fr-tile w-[260px]">
          <span className="fr-bubble top-1 right-0 border-[rgb(0_102_255/.6)]">
            <b className="text-accent-text">מכבי:</b> היום אתם בבית
          </span>
          <span className="fr-bubble top-14 left-0 border-[rgb(255_61_87/.6)]">
            <b className="text-[#ff6b80]">הפועל:</b> נראה אותך בסוף
          </span>
          <div className="fr-card inset-x-2 bottom-0.5 px-3.5 py-3 text-right">
            <div className="mb-2 text-sm font-bold">פנדל או לא?</div>
            <div className="flex justify-between text-xs text-muted">
              <span>פנדל</span>
              <span>64%</span>
            </div>
            <div className="fr-bar">
              <i style={{ width: '64%' }} />
            </div>
          </div>
        </div>
      )
    case 'reels':
      return (
        <div className="fr-tile w-[250px]">
          <div className="fr-tabs">
            <span className="bg-accent">כל הליגה</span>
            <span className="text-muted">הקבוצה שלי</span>
          </div>
          <span className="fr-reel top-[30px] right-3 rotate-6 bg-[linear-gradient(160deg,#1a3d8f,#0a0e1a)]" />
          <span className="fr-reel top-[38px] left-3 -rotate-6 bg-[linear-gradient(160deg,#7a1424,#0a0e1a)]" />
          <Badge className="-bottom-2.5 left-1/2 -translate-x-1/2">חי 24 שעות</Badge>
        </div>
      )
    case 'rating':
      return (
        <div className="fr-tile grid w-[240px] place-items-center">
          <div className="fr-card relative w-[170px] px-3.5 pt-4 pb-3.5 text-center">
            <div className="mx-auto mb-2 grid size-[62px] place-items-center rounded-full bg-[linear-gradient(160deg,#2e86ff,#003399)] font-brand text-2xl font-semibold">
              9
            </div>
            <div className="font-bold">החלוץ שלנו</div>
            <div className="mt-1 font-brand text-[32px] font-semibold tracking-[-0.02em] text-ok">8.4</div>
            <div className="text-xs text-muted">ציון האוהדים · 1,240 דירוגים</div>
          </div>
          <Badge className="top-0 -right-1">מצטיין המשחק</Badge>
        </div>
      )
    case 'rides':
      return (
        <div className="fr-tile grid w-[250px] place-items-center">
          <div className="fr-card relative w-[200px] p-3.5 text-right">
            <b>תל אביב ← באר שבע</b>
            <div className="mt-1.5 mb-2.5 text-[13px] text-muted">שבת · יציאה 17:00 · נהג: יוסי</div>
            <div className="flex gap-1.5">
              <span className="size-[26px] rounded-full bg-accent" />
              <span className="size-[26px] rounded-full bg-accent" />
              <span className="size-[26px] rounded-full border-2 border-dashed border-ok/60" />
              <span className="size-[26px] rounded-full border-2 border-dashed border-ok/60" />
            </div>
          </div>
          <Badge className="bottom-1.5 left-0">2 מקומות פנויים</Badge>
          <Badge className="top-1.5 right-0">הייתי שם</Badge>
        </div>
      )
  }
}
