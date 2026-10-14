'use client'

import { useCallback, useState } from 'react'
import { Heart } from 'lucide-react'
import { shortCount, type Clip } from '@/features/square/schema'
import { markStorySeenAction } from '../server/actions'
import { StoryViewer } from './story-viewer'

/** "🔥 החם בכיכר היום": reel cards of the most-liked posts; a card opens them full screen in the story viewer. */
export function HotClips({ clips, meId, myTeamId }: { clips: Clip[]; meId: string; myTeamId: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const items = clips.map((clip) => ({ clip, group: 0 }))
  const seen = useCallback((id: string) => {
    void markStorySeenAction({ clipId: id })
  }, [])
  const close = useCallback(() => setOpen(null), [])
  return (
    <>
      <ul className="hm-reels">
        {clips.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              className="hm-reel"
              aria-label={`הפוסט של ${c.nick}, ${shortCount(c.likes_count)} לייקים`}
              onClick={() => {
                seen(c.id)
                setOpen(i)
              }}
            >
              {c.url &&
                (c.kind === 'video' ? (
                  // First frame as the cover (no autoplay on the home).
                  <video src={`${c.url}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />
                ) : (
                  // Signed, short-lived Storage URL (as in the Square): no next/image cache.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.url} alt="" loading="lazy" />
                ))}
              <span className="hm-reel-likes" aria-hidden="true">
                <Heart className="size-3 fill-current" />
                {shortCount(c.likes_count)}
              </span>
              <span className="hm-reel-by" aria-hidden="true">
                {c.nick}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <StoryViewer items={items} start={open} meId={meId} myTeamId={myTeamId} label="החם בכיכר היום" onSeen={seen} onClose={close} />}
    </>
  )
}
