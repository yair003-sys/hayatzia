'use client'

import { useCallback, useState } from 'react'
import { Heart, ImagePlus } from 'lucide-react'
import { UploadClip } from '@/features/square/components/upload-clip'
import { shortCount, type Clip } from '@/features/square/schema'
import { markSeen } from './seen-store'
import { StoryViewer } from './story-viewer'

type Props = { clips: Clip[]; meId: string; myTeamId: string; myNick: string; teamShort: string }

/**
 * "🔥 החם בכיכר היום": reel cards of the most-liked posts; a card opens them full screen in the story viewer. With none
 * yet, an empty card of the row's size opens the Square upload sheet (as the stories "+" does).
 */
export function HotClips({ clips, meId, myTeamId, myNick, teamShort }: Props) {
  const [open, setOpen] = useState<number | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const items = clips.map((clip) => ({ clip, group: 0 }))
  const close = useCallback(() => setOpen(null), [])
  if (clips.length === 0)
    return (
      <div className="hm-reels-empty">
        <ImagePlus className="size-6 text-accent-text" strokeWidth={1.75} aria-hidden="true" />
        <p>{uploaded ? 'הסרטון עלה לכיכר ✓' : 'עוד אין סרטונים היום'}</p>
        <UploadClip
          meId={meId}
          myTeamId={myTeamId}
          myNick={myNick}
          audience="team"
          teamShort={teamShort}
          choosing={choosing}
          setChoosing={setChoosing}
          onStart={(local) => {
            if (local.url?.startsWith('blob:')) URL.revokeObjectURL(local.url)
          }}
          onDone={(localId, clip) => setUploaded(clip !== null)}
          trigger={
            <button type="button" className="hm-empty-btn" onClick={() => setChoosing(true)}>
              העלה את הראשון
            </button>
          }
        />
      </div>
    )
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
                markSeen(c.id)
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
      {open !== null && <StoryViewer items={items} start={open} meId={meId} myTeamId={myTeamId} label="החם בכיכר היום" onSeen={markSeen} onClose={close} />}
    </>
  )
}
