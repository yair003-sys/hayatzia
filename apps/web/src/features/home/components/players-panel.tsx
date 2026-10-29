'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FanPitch } from '@/features/stand-home/components/fan-pitch'
import type { Team } from '@/features/teams/data'
import type { PlayerRow } from '@/features/ratings/schema'
import { PlayerReviews } from './player-reviews'
import type { HomePlayer } from '../server/queries'

/**
 * One players area with two views, so the pitch and the reviews live together without feeling like two sections
 * (owner 2026-10-18, "make it cleaner"). "מגרש" is the tap-to-rate lineup; "רשימה" is the fans' moving reviews.
 * Both datasets are already on the client, so the toggle is instant.
 */
export function PlayersPanel({ team, players, squad }: { team: Team; players: HomePlayer[] | null; squad: PlayerRow[] }) {
  const t = useTranslations('home')
  const [view, setView] = useState<'pitch' | 'list'>('pitch')
  return (
    <>
      <div className="hm-seg" role="tablist" aria-label={t('playersView')}>
        <button type="button" role="tab" aria-selected={view === 'pitch'} className="hm-seg-btn" data-on={view === 'pitch'} onClick={() => setView('pitch')}>
          {t('pitch')}
        </button>
        <button type="button" role="tab" aria-selected={view === 'list'} className="hm-seg-btn" data-on={view === 'list'} onClick={() => setView('list')}>
          {t('list')}
        </button>
      </div>
      {view === 'pitch' ? (
        <FanPitch team={team} initial={squad} />
      ) : players ? (
        <PlayerReviews players={players} />
      ) : (
        <p className="hm-seg-empty">{t('reviewsLoadFail')}</p>
      )}
    </>
  )
}
