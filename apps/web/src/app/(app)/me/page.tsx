import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Lock, LogOut } from 'lucide-react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { signOutAction } from '@/features/profile/server/actions'
import { InstallApp } from '@/features/pwa/install-app'
import { PushToggle } from '@/features/push/components/push-toggle'
import { pushConfigured } from '@/features/push/server/send'
import { NotificationSettings } from '@/features/push/components/notification-settings'
import { getMyPrefs } from '@/features/push/server/queries'
import { env } from '@/lib/env'
import { getLeague } from '@/features/matches/server/queries'
import { getFanCard } from '@/features/me/server/queries'
import { fanNumber, memberSince } from '@/features/me/schema'
import { teamAccent } from '@/features/stand-home/schema'

export const metadata: Metadata = { title: 'הכרטיס שלי' }

// "הכרטיס שלי" (owner, 2026-10-13): private to the fan, with the fan's own numbers.
export default function MePage() {
  return (
    <section className="space-y-6">
      <h1 className="sr-only">הכרטיס שלי</h1>
      <Suspense fallback={<div className="skeleton h-56 rounded-3xl" aria-hidden="true" />}>
        <ProfileCard />
      </Suspense>
    </section>
  )
}

async function ProfileCard() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') {
    return <p className="rounded-2xl bg-surface p-4 text-muted">אין חשבון מחובר בסביבה הזאת.</p>
  }
  const league = await getLeague()
  const [card, prefs] = await Promise.all([getFanCard(s.userId, s.team.id, league?.league.season ?? null), getMyPrefs(s.userId)])
  const a = teamAccent(s.team.bar)
  const colours = { '--club': s.team.bg, '--club2': s.team.ring, '--club-rgb': a.rgb, '--club-text': a.text } as CSSProperties

  return (
    <div className="space-y-7">
      <article className="me-card" style={colours} aria-label={`כרטיס האוהד של ${s.nick}`}>
        <span className="me-scarf" aria-hidden="true" />
        <div className="me-card-top">
          <span dir="ltr" className="font-brand text-sm font-extrabold tracking-[-0.02em] text-white/85">
            onefan
          </span>
          <span className="me-private">
            <Lock className="size-3" aria-hidden="true" />
            פרטי · רק אתה רואה
          </span>
        </div>
        <div>
          <p className="me-nick">{s.nick}</p>
          <p className="me-club">אוהד {s.team.name}</p>
        </div>
        <dl className="me-card-meta">
          <div>
            <dt>מס׳ אוהד</dt>
            <dd className="t-num">{card ? fanNumber(card.number) : '—'}</dd>
          </div>
          <div>
            <dt>אוהד מאז</dt>
            <dd>{card ? memberSince(card.joinedAt) : '—'}</dd>
          </div>
          <div>
            <dt>הקבוצה</dt>
            <dd>נעולה לתמיד</dd>
          </div>
        </dl>
      </article>

      <section aria-labelledby="me-stats" className="space-y-3">
        <h2 id="me-stats" className="me-label">
          הנתונים שלי · העונה
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          <Stat value={card?.games ?? 0} label="משחקים שהייתי בהם" sub={card && card.away > 0 ? `${card.away} מהם בחוץ` : 'צ׳ק-אין באצטדיון'} />
          <Stat value={card?.points ?? 0} label="נקודות בניחושים" sub={card?.rank ? `מקום ${card.rank} באוהדי ${s.team.short}` : 'עוד לא ניחשת'} />
          <Stat value={card?.exact ?? 0} label="תוצאות מדויקות" sub="3 נקודות כל אחת" />
          <Stat value={card?.rated ?? 0} label="משחקים שדירגת" sub="ציון לשחקנים אחרי המשחק" />
        </div>
      </section>

      <section aria-labelledby="me-settings" className="space-y-3">
        <h2 id="me-settings" className="me-label">
          הגדרות
        </h2>
        <div className="space-y-2.5">
          <InstallApp />
          {pushConfigured() && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && <PushToggle vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />}
          <NotificationSettings initial={prefs} />
          <form action={signOutAction}>
            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 font-medium text-muted">
              <LogOut className="size-4" aria-hidden="true" />
              יציאה מהחשבון
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}

function Stat({ value, label, sub }: { value: number; label: string; sub: string }) {
  return (
    <div className="me-stat">
      <b className="t-num">{value.toLocaleString('he-IL')}</b>
      <span className="text-sm text-fg">{label}</span>
      <span className="text-xs text-dim">{sub}</span>
    </div>
  )
}
