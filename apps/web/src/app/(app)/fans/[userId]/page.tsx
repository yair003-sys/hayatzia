import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getLeague } from '@/features/matches/server/queries'
import { getFanProfile } from '@/features/fans/server/queries'
import { getFanCard } from '@/features/me/server/queries'
import { teamAccent } from '@/features/stand-home/schema'
import { SendMessage } from '@/features/fans/components/send-message'

export const metadata: Metadata = { title: 'פרופיל אוהד' }

// The public card of another fan (owner, 2026-10-31): the same look as "הכרטיס שלי", read-only, with a "שלח הודעה"
// button that opens the private conversation with them. Only club-mates are visible (RLS).
export default function Page({ params }: PageProps<'/fans/[userId]'>) {
  return (
    <section className="space-y-6">
      <Suspense fallback={<div className="skeleton h-72 rounded-3xl" aria-hidden="true" />}>
        {params.then(({ userId }) => (
          <FanCard userId={userId} />
        ))}
      </Suspense>
    </section>
  )
}

async function FanCard({ userId }: { userId: string }) {
  const me = await getSessionProfile()
  if (me.status === 'ready' && me.userId === userId) redirect('/me')

  const fan = await getFanProfile(userId)
  if (!fan) {
    return <p className="rounded-2xl bg-surface p-4 text-muted">הפרופיל לא זמין. אפשר לראות רק אוהדים של הקבוצה שלך.</p>
  }

  const league = await getLeague()
  const season = league?.league.season ?? null
  const card = await getFanCard(userId, fan.team.id, season)

  const a = teamAccent(fan.team.bar)
  const colours = { '--club': fan.team.bg, '--club2': fan.team.ring, '--club-rgb': a.rgb, '--club-on': a.on } as CSSProperties

  return (
    <div className="space-y-5" style={colours}>
      <article className="overflow-hidden rounded-3xl bg-surface" aria-label={`הפרופיל של ${fan.nick}`}>
        {/* Cover (read-only). */}
        <div className="relative h-44" style={{ background: 'linear-gradient(135deg, var(--club) -10%, #0b1026 78%)' }}>
          {fan.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fan.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-surface" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-end p-4">
            <span dir="ltr" className="font-brand text-sm font-extrabold tracking-[-0.02em] text-white/90 drop-shadow">
              onefan
            </span>
          </div>
        </div>

        <div className="px-4 pb-5">
          {/* Avatar (read-only). */}
          <div className="-mt-12 mb-2.5">
            <div
              className="relative size-[92px] rounded-[22px] p-[3px] shadow-[0_14px_30px_-12px_rgba(0,0,0,0.8)]"
              style={{ background: 'linear-gradient(150deg, var(--club), var(--club2))' }}
            >
              {fan.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fan.avatarUrl} alt="" className="size-full rounded-[19px] object-cover" />
              ) : (
                <span
                  className="t-serif grid size-full place-items-center rounded-[19px] text-[38px] text-fg"
                  style={{ background: 'radial-gradient(120% 120% at 30% 20%, #2a3350, #141a2b 70%)' }}
                  aria-hidden="true"
                >
                  {fan.nick.slice(0, 1)}
                </span>
              )}
            </div>
          </div>

          <h2 className="t-serif text-[26px] leading-tight">{fan.nick}</h2>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {card?.label && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-extrabold"
                style={{ background: 'rgb(var(--club-rgb))', color: 'var(--club-on)' }}
              >
                {card.label.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-muted">
              <span
                className="t-serif grid size-5 place-items-center rounded-md text-[11px]"
                style={{ background: 'linear-gradient(160deg, var(--club), var(--club2))', color: 'var(--club-on)' }}
                aria-hidden="true"
              >
                {fan.team.short.slice(0, 1)}
              </span>
              {fan.team.name}
            </span>
          </div>

          {card && (
            <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-dim">
              <span>
                <b className="t-num text-muted">{card.games.toLocaleString('he-IL')}</b> משחקים באצטדיון
              </span>
              <span>
                <b className="t-num text-muted">{card.away.toLocaleString('he-IL')}</b> משחקי חוץ
              </span>
              <span>
                <b className="t-num text-muted">{card.exact.toLocaleString('he-IL')}</b> ניחושים מדויקים
              </span>
              <span>
                <b className="t-num text-muted">{card.rated.toLocaleString('he-IL')}</b> דירוגים
              </span>
              {card.rank ? (
                <span>
                  מקום <b className="t-num text-muted">{card.rank}</b> ב{fan.team.short}
                </span>
              ) : null}
            </p>
          )}

          <div className="mt-4">
            <SendMessage otherId={userId} />
          </div>
        </div>
      </article>
    </div>
  )
}
