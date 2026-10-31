import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { Pencil, Play, Swords } from 'lucide-react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getLeague } from '@/features/matches/server/queries'
import { getFanCard, getMyClips, getMyPhotos, type MyClip } from '@/features/me/server/queries'
import { fanNumber, memberSince } from '@/features/me/schema'
import { teamAccent } from '@/features/stand-home/schema'
import { recordLine } from '@/features/crowd-war/schema'
import { getWarRecord } from '@/features/crowd-war/server/queries'
import { ProfileAvatar, ProfileCover } from '@/features/me/components/profile-photos'
import { CountPanel, ProfileTabs } from '@/features/me/components/profile-tabs'
import { ShareProfile } from '@/features/me/components/share-profile'
import { LoadError } from '@/components/load-error'

export const metadata: Metadata = { title: 'הכרטיס שלי' }

// "הכרטיס שלי" (owner, 2026-10-31 redesign): a clean profile — cover, avatar, identity, and the fan's own content in
// word-tabs. Settings moved to their own page (/settings), reached from the gear by the bell. The public view of
// another fan is /fans/[userId].
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
  const [card, clips, war, photos] = await Promise.all([
    getFanCard(s.userId, s.team.id, season),
    getMyClips(s.userId),
    season === null ? Promise.resolve(null) : getWarRecord(s.team.id, season),
    getMyPhotos(s.userId),
  ])
  const a = teamAccent(s.team.bar)
  const colours = { '--club': s.team.bg, '--club2': s.team.ring, '--club-rgb': a.rgb, '--club-text': a.text } as CSSProperties

  return (
    <div className="space-y-5" style={colours}>
      {/* Profile header: cover + avatar + identity + actions. The look lives in the club's own colours. */}
      <article className="overflow-hidden rounded-3xl bg-surface" aria-label={`הפרופיל של ${s.nick}`}>
        <ProfileCover meId={s.userId} initialUrl={photos.coverUrl} />

        <div className="px-4 pb-5">
          <div className="-mt-12 mb-2.5">
            <ProfileAvatar meId={s.userId} nick={s.nick} initialUrl={photos.avatarUrl} />
          </div>

          <h2 className="t-serif text-[26px] leading-tight">{s.nick}</h2>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {card?.label && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-extrabold"
                style={{ background: 'rgb(var(--club-rgb))', color: 'var(--club-text)' }}
              >
                {card.label.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-muted">
              <span
                className="t-serif grid size-5 place-items-center rounded-md text-[11px]"
                style={{ background: 'linear-gradient(160deg, var(--club), var(--club2))', color: 'var(--club-text)' }}
                aria-hidden="true"
              >
                {s.team.short.slice(0, 1)}
              </span>
              {s.team.name}
            </span>
          </div>

          <p className="mt-1.5 text-[13px] text-muted">
            אוהד מאז <b className="text-fg">{card ? memberSince(card.joinedAt) : '—'}</b> · מס׳ אוהד{' '}
            <b className="t-num text-fg">{card ? fanNumber(card.number) : '—'}</b> · נעול לתמיד
          </p>

          <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-dim">
            <span>
              <b className="t-num text-muted">{(card?.games ?? 0).toLocaleString('he-IL')}</b> משחקים באצטדיון
            </span>
            <span>
              <b className="t-num text-muted">{(card?.points ?? 0).toLocaleString('he-IL')}</b> נק׳ בניחושים
            </span>
            <span>
              <b className="t-num text-muted">{(card?.rated ?? 0).toLocaleString('he-IL')}</b> דירוגים
            </span>
            {card?.rank ? (
              <span>
                מקום <b className="t-num text-muted">{card.rank}</b> ב{s.team.short}
              </span>
            ) : null}
          </p>

          {/* Hidden when the record cannot be read: never a made-up 0–0. */}
          {war && (
            <p className="cw-record mt-2.5">
              <Swords className="size-4 shrink-0" aria-hidden="true" />
              <span className="t-num">{recordLine(war)}</span>
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Link
              href="/settings"
              className="inline-flex min-h-[42px] flex-[1.4] items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold"
            >
              <Pencil className="size-4" aria-hidden="true" />
              ערוך פרופיל
            </Link>
            <ShareProfile nick={s.nick} />
          </div>
        </div>
      </article>

      <ProfileTabs
        tabs={[
          { key: 'clips', label: 'הקליפים שלי', node: <ClipsGrid clips={clips} /> },
          { key: 'here', label: 'הייתי שם', node: <CountPanel value={card?.games ?? 0} label="משחקים שהיית בהם באצטדיון העונה" /> },
          { key: 'rated', label: 'הדירוגים שלי', node: <CountPanel value={card?.rated ?? 0} label="משחקים שדירגת העונה" /> },
        ]}
      />
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
