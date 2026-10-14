import type { Route } from 'next'
import Link from 'next/link'
import { Car, Heart, Play } from 'lucide-react'
import { Avatar } from '@/features/dm/components/avatar'
import { isUnseen } from '../activity'
import type { ActivityItem } from '../server/queries'

/**
 * Rows of the list (pure view). Rows changed after `seenAt` (the fan's previous visit, kept for the whole visit) are
 * highlighted. No message text anywhere.
 */
export function ActivityRows({ items, seenAt }: { items: ActivityItem[]; seenAt: string | null }) {
  return (
    <ul className="act-list">
      {items.map((a) => {
        const trip = a.kind === 'trip_request' || a.kind === 'trip_accepted'
        const unseen = isUnseen(a.updatedAt, seenAt)
        return (
          <li key={a.id}>
            <Link href={a.href as Route} className="act-row" data-unseen={unseen ? '' : undefined}>
              <span className="act-who">
                <Avatar id={a.actorId ?? ''} name={a.nick?.trim() || 'אוהד'} size="sm" />
                <span className="act-kind" data-kind={trip ? 'trip' : 'like'} aria-hidden="true">
                  {trip ? <Car className="size-2.5" strokeWidth={2.6} /> : <Heart className="size-2.5" strokeWidth={2.6} fill="currentColor" />}
                </span>
              </span>
              <span className="act-text">
                <span className="act-line">{a.line}</span>
                <span className="act-meta">
                  {a.sub && <>{a.sub} · </>}
                  {a.when}
                </span>
              </span>
              {unseen && <span className="sr-only">חדש</span>}
              {!trip && (
                <span className="act-thumb" aria-hidden="true">
                  {a.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; next/image adds nothing here
                    <img src={a.thumb} alt="" loading="lazy" decoding="async" />
                  ) : a.video ? (
                    <Play className="size-4" strokeWidth={2.4} />
                  ) : null}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
