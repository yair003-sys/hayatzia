'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Shirt, Star } from 'lucide-react'
import { UploadClip } from '@/features/square/components/upload-clip'
import { flattenStories, initialOf, type StoryGroup } from '../schema'
import type { StoryItem } from '../server/queries'
import { markSeen, useSeenNow } from './seen-store'
import { StoryViewer } from './story-viewer'

type Props = {
  groups: StoryGroup<StoryItem>[]
  /** "ההרכב שלך": the next match whose lineup is open. */
  lineupFixtureId: number | null
  /** "דרג את השחקנים": after a finished match. */
  rate: boolean
  meId: string
  myTeamId: string
  myNick: string
  teamShort: string
}

/**
 * Stories row: "+" (a new Square post for the club's fans), the app's own circles, then one circle per fan with
 * fresh posts (coloured ring) or only seen ones (grey). A circle opens the full-screen viewer at that fan's first
 * unseen post and plays on through the next fans. Circles keep their place while you watch; only the rings change.
 */
export function StoriesRow({ groups, lineupFixtureId, rate, meId, myTeamId, myNick, teamShort }: Props) {
  const seenNow = useSeenNow()
  const [open, setOpen] = useState<number | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [upload, setUpload] = useState<'idle' | 'busy' | 'done'>('idle')
  const router = useRouter()
  const preview = useRef<string | null>(null)

  const now = groups.map((g) => {
    const clips = g.clips.map((c) => ({ ...c, seen: c.seen || seenNow.has(c.id) }))
    return { ...g, clips, seen: clips.every((c) => c.seen) }
  })
  const { items, starts } = flattenStories(now)

  const close = useCallback(() => setOpen(null), [])

  // "עלה לכיכר ✓" for a few seconds, then back to "הסטורי שלך".
  useEffect(() => {
    if (upload !== 'done') {
      return
    }
    const t = setTimeout(() => setUpload('idle'), 4000)
    return () => {
      clearTimeout(t)
    }
  }, [upload])

  const label = upload === 'busy' ? 'מעלה…' : upload === 'done' ? 'עלה לכיכר ✓' : 'הסטורי שלך'

  return (
    <div className="hm-stories" role="list" aria-label="סטוריז">
      <div role="listitem" className="hm-story">
        <UploadClip
          meId={meId}
          myTeamId={myTeamId}
          myNick={myNick}
          audience="team"
          teamShort={teamShort}
          choosing={choosing}
          setChoosing={setChoosing}
          onStart={(local) => {
            preview.current = local.url
            setUpload('busy')
          }}
          onDone={(localId, clip) => {
            if (preview.current?.startsWith('blob:')) URL.revokeObjectURL(preview.current)
            preview.current = null
            setUpload(clip ? 'done' : 'idle')
            // The new post joins the home sections (the stories and "החם בכיכר") without reloading the page.
            if (clip) router.refresh()
          }}
          trigger={
            <button type="button" className="hm-story-btn" aria-label={`סטורי חדש לאוהדי ${teamShort}`} onClick={() => setChoosing(true)}>
              <span className="hm-ring" data-kind="add">
                <span className="hm-face">
                  <Plus className="size-6" strokeWidth={2.4} aria-hidden="true" />
                </span>
              </span>
            </button>
          }
        />
        <span className="hm-story-name" aria-live="polite">
          {label}
        </span>
      </div>

      {lineupFixtureId !== null && (
        <div role="listitem" className="hm-story">
          <Link href={`/matches/${lineupFixtureId}?tab=lineup`} className="hm-story-btn">
            <span className="hm-ring" data-kind="app">
              <span className="hm-face" data-kind="lineup">
                <Shirt className="size-6" strokeWidth={1.8} aria-hidden="true" />
              </span>
            </span>
            <span className="hm-story-name" data-strong>
              ההרכב שלך
            </span>
          </Link>
        </div>
      )}
      {rate && (
        <div role="listitem" className="hm-story">
          <Link href="/stand/players" className="hm-story-btn">
            <span className="hm-ring" data-kind="app">
              <span className="hm-face" data-kind="rate">
                <Star className="size-6" strokeWidth={1.8} aria-hidden="true" />
              </span>
            </span>
            <span className="hm-story-name" data-strong>
              דרג את השחקנים
            </span>
          </Link>
        </div>
      )}

      {now.map((g, gi) => {
        const thumb = [...g.clips].reverse().find((c) => c.kind === 'image' && c.url)?.url
        return (
          <div key={g.userId} role="listitem" className="hm-story">
            <button
              type="button"
              className="hm-story-btn"
              aria-label={`הסטורי של ${g.nick}${g.seen ? '' : ', חדש'}`}
              onClick={() => {
                const start = starts[gi] ?? 0
                const first = items[start]
                if (first) markSeen(first.clip.id)
                setOpen(start)
              }}
            >
              <span className="hm-ring" data-seen={g.seen}>
                <span className="hm-face">
                  {thumb ? (
                    // Signed, short-lived Storage URL (as in the Square): no next/image cache.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">{initialOf(g.nick)}</span>
                  )}
                </span>
              </span>
              <span className="hm-story-name" data-seen={g.seen} aria-hidden="true">
                {g.nick}
              </span>
            </button>
          </div>
        )
      })}

      {open !== null && (
        <StoryViewer items={items} start={open} meId={meId} myTeamId={myTeamId} label="סטוריז של האוהדים" onSeen={markSeen} onClose={close} />
      )}
    </div>
  )
}
