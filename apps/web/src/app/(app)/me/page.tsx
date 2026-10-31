import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { IdCard, Lock, Pencil, Play, Swords } from 'lucide-react'
import { getPrivateProfile, getSessionProfile } from '@/features/profile/server/queries'
import { DmRequestsSetting } from '@/features/dm/components/dm-requests-setting'
import { SignOutButton } from '@/features/profile/components/sign-out-button'
import { InstallApp } from '@/features/pwa/install-app'
import { PushToggle } from '@/features/push/components/push-toggle'
import { pushConfigured } from '@/features/push/server/send'
import { NotificationSettings } from '@/features/push/components/notification-settings'
import { getMyPrefs } from '@/features/push/server/queries'
import { env } from '@/lib/env'
import { getLeague } from '@/features/matches/server/queries'
import { getFanCard, getMyClips, type MyClip } from '@/features/me/server/queries'
import { fanNumber, memberSince } from '@/features/me/schema'
import { teamAccent } from '@/features/stand-home/schema'
import { recordLine } from '@/features/crowd-war/schema'
import { getWarRecord } from '@/features/crowd-war/server/queries'
import { DeleteAccount } from '@/features/account/components/delete-account'
import { AdminBadge } from '@/features/admin/components/admin-badge'
import { ContactForm } from '@/features/safety/components/contact-form'
import { LegalLinks } from '@/features/legal/components/legal-links'
import { NOT_AFFILIATED } from '@/lib/legal'
import { GenderPicker } from '@/features/team-life/components/ride-safety'
import { getMyRideProfile } from '@/features/team-life/server/queries'
import { features } from '@/lib/flags'
import { LoadError } from '@/components/load-error'

export const metadata: Metadata = { title: 'הכרטיס שלי' }

// "הכרטיס שלי" (owner, 2026-10-31 redesign): the owner's view of their own profile — cover, avatar, identity and their
// own content — with every account setting kept below. The public view of another fan is /fans/[userId].
export default function MePage() {
  return (
    <section className="space-y-6">
      <h1 className="sr-only">הכרטיס שלי</h1>
      <Suspense fallback={<div className="skeleton h-72 rounded-3xl" aria-hidden="true" />}>
        <Profile />
      </Suspense>
    </section>
  )
}

async function Profile() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') {
    return <p className="rounded-2xl bg-surface p-4 text-muted">אין חשבון מחובר בסביבה הזאת.</p>
  }
  const league = await getLeague()
  const season = league?.league.season ?? null
  const [card, clips, prefs, war, ride, priv] = await Promise.all([
    getFanCard(s.userId, s.team.id, season),
    getMyClips(s.userId),
    getMyPrefs(s.userId),
    season === null ? Promise.resolve(null) : getWarRecord(s.team.id, season),
    getMyRideProfile(),
    getPrivateProfile(),
  ])
  const a = teamAccent(s.team.bar)
  const colours = { '--club': s.team.bg, '--club2': s.team.ring, '--club-rgb': a.rgb, '--club-text': a.text } as CSSProperties

  return (
    <div className="space-y-6">
      {/* Profile header: cover + avatar + identity. The look lives in the club's own colours. */}
      <article className="overflow-hidden rounded-3xl bg-surface" style={colours} aria-label={`הפרופיל של ${s.nick}`}>
        <div className="relative h-36" style={{ background: 'linear-gradient(135deg, var(--club) -10%, #0b1026 78%)' }}>
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <span dir="ltr" className="font-brand text-sm font-extrabold tracking-[-0.02em] text-white/90 drop-shadow">
              onefan
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-bold text-white/90 backdrop-blur">
              <Lock className="size-3" aria-hidden="true" />
              פרטי · רק אתה
            </span>
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-surface" aria-hidden="true" />
        </div>

        <div className="px-4 pb-5">
          <div className="-mt-11 mb-3 flex items-end justify-between gap-3">
            <span
              className="grid size-[86px] place-items-center rounded-3xl text-4xl font-black ring-4 ring-surface"
              style={{ background: 'linear-gradient(160deg, var(--club), var(--club2))', color: 'var(--club-text)' }}
              aria-hidden="true"
            >
              {s.nick.slice(0, 1)}
            </span>
            <a
              href="#settings"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 text-sm font-bold"
            >
              <Pencil className="size-4" aria-hidden="true" />
              ערוך פרופיל
            </a>
          </div>

          <h2 className="text-2xl font-black leading-tight">{s.nick}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {card?.label && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: 'rgb(var(--club-rgb))', color: 'var(--club-text)' }}>
                <span aria-hidden="true">{card.label.emoji}</span>
                {card.label.label}
              </span>
            )}
            <span className="text-sm font-semibold text-muted">אוהד {s.team.name}</span>
          </div>

          <p className="mt-3 text-xs font-medium text-dim">
            מס׳ אוהד <b className="t-num text-muted">{card ? fanNumber(card.number) : '—'}</b> · אוהד מאז{' '}
            <b className="text-muted">{card ? memberSince(card.joinedAt) : '—'}</b> · הקבוצה נעולה לתמיד
          </p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-dim">
            <span>
              <b className="t-num text-muted">{(card?.games ?? 0).toLocaleString('he-IL')}</b> משחקים באצטדיון
            </span>
            <span>
              <b className="t-num text-muted">{(card?.points ?? 0).toLocaleString('he-IL')}</b> נק׳ בניחושים
            </span>
            <span>
              <b className="t-num text-muted">{(card?.rated ?? 0).toLocaleString('he-IL')}</b> משחקים שדירגת
            </span>
            {card?.rank ? <span>מקום {card.rank} באוהדי {s.team.short}</span> : null}
          </p>
          {/* Hidden when the record cannot be read: never a made-up 0–0. */}
          {war && (
            <p className="cw-record mt-3">
              <Swords className="size-4 shrink-0" aria-hidden="true" />
              <span className="t-num">{recordLine(war)}</span>
            </p>
          )}
        </div>
      </article>

      {/* The fan's own content. */}
      <section aria-labelledby="me-content" className="space-y-3">
        <h2 id="me-content" className="me-label">
          הקליפים שלי
        </h2>
        <ClipsGrid clips={clips} />
      </section>

      <section id="settings" aria-labelledby="me-settings" className="scroll-mt-20 space-y-3">
        <h2 id="me-settings" className="me-label">
          הגדרות
        </h2>
        <div className="space-y-2.5">
          <Suspense fallback={null}>
            <AdminBadge />
          </Suspense>
          <InstallApp />
          {pushConfigured() && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && <PushToggle vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />}
          <NotificationSettings initial={prefs} />
          {features.rides && (
            <>
              <GenderPicker initial={ride?.gender ?? null} />
              <Link href="/me/verify" className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-line px-4 py-3 font-medium">
                <IdCard className="size-4" aria-hidden="true" />
                אימות לנסיעות
              </Link>
            </>
          )}
          {priv && <DmRequestsSetting initial={priv.dmRequests} />}
          <SignOutButton />
          <ContactForm />
          <DeleteAccount />
        </div>
        <LegalLinks />
        <p className="text-center text-xs text-dim">{NOT_AFFILIATED}</p>
      </section>
    </div>
  )
}

function ClipsGrid({ clips }: { clips: MyClip[] | null }) {
  if (clips === null) return <LoadError />
  if (clips.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-5 text-center text-sm text-muted">
        עדיין אין קליפים. מה שתעלה לכיכר יופיע כאן (קליפ נשאר 24 שעות).
      </p>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {clips.map((c) => (
        <div key={c.id} className="relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-2">
          {c.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden="true" />
          {c.kind === 'video' && <Play className="absolute end-2 top-2 size-4 text-white drop-shadow" aria-hidden="true" />}
          {c.likes > 0 && <span className="t-num absolute bottom-1.5 start-2 text-xs font-bold text-white drop-shadow">{c.likes}</span>}
        </div>
      ))}
    </div>
  )
}
