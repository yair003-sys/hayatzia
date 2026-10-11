'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Heart, ImagePlus, MessageCircle, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { shortCount } from '@/features/square/schema'
import { PHOTO_ACCEPT, PHOTO_EXT, PHOTO_MAX_MB, PHOTOS_PAGE, type PhotoComment, type StandPhoto } from '../schema'
import {
  addPhotoCommentAction,
  createPhotoAction,
  deletePhotoAction,
  likePhotoAction,
  morePhotosAction,
  photoCommentsAction,
} from '../server/actions'

export function StandPhotos({ initial, meId, teamShort }: { initial: StandPhoto[]; meId: string; teamShort: string }) {
  const router = useRouter()
  const [photos, setPhotos] = useState(initial)
  const [hasMore, setHasMore] = useState(initial.length >= PHOTOS_PAGE)
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  const pick = (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!PHOTO_EXT[f.type]) return setError('אפשר להעלות רק תמונה')
    if (f.size > PHOTO_MAX_MB * 1024 * 1024) return setError(`התמונה גדולה מ־${PHOTO_MAX_MB}MB`)
    setFile(f)
  }

  const publish = () => {
    if (!file) return
    start(async () => {
      const path = `${meId}/${crypto.randomUUID()}.${PHOTO_EXT[file.type]}`
      const up = await createClient().storage.from('stand').upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) return setError('ההעלאה נכשלה. נסה שוב')
      const r = await createPhotoAction({ path, caption })
      if (!r.data?.ok) return setError(r.data?.error ?? 'הפרסום נכשל')
      setFile(null)
      setCaption('')
      router.refresh()
    })
  }

  const last = photos.at(-1)

  return (
    <div className="space-y-4">
      <input ref={gallery} type="file" accept={PHOTO_ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {file ? (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
          <p className="text-sm">
            {file.name} · יוצג רק לאוהדי {teamShort}
          </p>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="כיתוב (לא חובה)" aria-label="כיתוב" className="w-full rounded-md border border-line bg-elev px-3 py-2" />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={publish} className="flex-1 rounded-lg bg-accent py-2.5 font-semibold text-white disabled:opacity-50">
              {pending ? 'מעלה…' : 'פרסם ביציע'}
            </button>
            <button type="button" onClick={() => setFile(null)} className="rounded-lg border border-line px-4">
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => gallery.current?.click()} className="flex items-center justify-center gap-2 rounded-lg bg-accent py-3 font-semibold text-white">
            <ImagePlus className="size-5" aria-hidden="true" />
            תמונה מהגלריה
          </button>
          <button type="button" onClick={() => camera.current?.click()} className="flex items-center justify-center gap-2 rounded-lg border border-line py-3 font-semibold">
            <Camera className="size-5" aria-hidden="true" />
            צילום עכשיו
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}

      {photos.length === 0 ? (
        <p className="py-10 text-center text-muted">עוד אין תמונות מהיציע. תעלה את הראשונה 📸</p>
      ) : (
        <ul className="space-y-4">
          {photos.map((p) => (
            <li key={p.id}>
              <PhotoCard photo={p} mine={p.user_id === meId} onRemoved={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))} />
            </li>
          ))}
        </ul>
      )}
      {hasMore && last && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const more = (await morePhotosAction({ createdAt: last.created_at, id: last.id })).data?.photos ?? []
              setPhotos((cur) => [...cur, ...more.filter((m) => !cur.some((x) => x.id === m.id))])
              setHasMore(more.length >= PHOTOS_PAGE)
            })
          }
          className="w-full rounded-lg border border-line py-3 text-sm text-muted"
        >
          עוד תמונות
        </button>
      )}
    </div>
  )
}

function PhotoCard({ photo, mine, onRemoved }: { photo: StandPhoto; mine: boolean; onRemoved: () => void }) {
  const [liked, setLiked] = useState(photo.liked)
  const [likes, setLikes] = useState(photo.likes_count)
  const [comments, setComments] = useState<PhotoComment[] | null>(null)
  const [count, setCount] = useState(photo.comments_count)
  const [draft, setDraft] = useState('')
  const [pending, start] = useTransition()

  return (
    <article className="overflow-hidden rounded-lg border border-line-soft bg-surface">
      {photo.url && (
        // Signed, short-lived Storage URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt={photo.caption || `תמונה מהיציע של ${photo.nick}`} loading="lazy" className="max-h-[70dvh] w-full bg-elev object-contain" />
      )}
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex items-center gap-3 text-sm">
          <b>{photo.nick}</b>
          {photo.caption && <span className="text-muted">{photo.caption}</span>}
          {mine && (
            <button
              type="button"
              aria-label="מחק תמונה"
              className="ms-auto text-dim"
              onClick={() => start(async () => ((await deletePhotoAction({ photoId: photo.id })).data?.ok ? onRemoved() : undefined))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <button
            type="button"
            aria-pressed={liked}
            onClick={() => {
              const on = !liked
              setLiked(on)
              setLikes((n) => n + (on ? 1 : -1))
              start(async () => {
                if (!(await likePhotoAction({ photoId: photo.id, on })).data?.ok) {
                  setLiked(!on)
                  setLikes((n) => n - (on ? 1 : -1))
                }
              })
            }}
            className={cn('flex items-center gap-1', liked ? 'text-live' : 'text-muted')}
          >
            <Heart className={cn('size-5', liked && 'fill-current')} aria-hidden="true" />
            <span className="sr-only">לייק</span>
            {shortCount(likes)}
          </button>
          <button
            type="button"
            aria-expanded={comments !== null}
            onClick={() =>
              comments ? setComments(null) : start(async () => setComments((await photoCommentsAction({ photoId: photo.id })).data?.comments ?? []))
            }
            className="flex items-center gap-1 text-muted"
          >
            <MessageCircle className="size-5" aria-hidden="true" />
            <span className="sr-only">תגובות</span>
            {shortCount(count)}
          </button>
        </div>
        {comments && (
          <div className="space-y-2 border-t border-line-soft pt-2">
            <ul className="space-y-1">
              {comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <b className="text-accent-text">{c.nick}</b> {c.body}
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const body = draft.trim()
                if (!body) return
                start(async () => {
                  const c = (await addPhotoCommentAction({ photoId: photo.id, body })).data?.comment
                  if (c) {
                    setComments((cur) => [...(cur ?? []), c])
                    setCount((n) => n + 1)
                    setDraft('')
                  }
                })
              }}
            >
              <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} placeholder="תגובה…" aria-label="תגובה" className="min-w-0 flex-1 rounded-md border border-line bg-elev px-3 py-2 text-sm" />
              <button type="submit" disabled={pending || !draft.trim()} className="rounded-md bg-accent px-3 text-sm text-white disabled:opacity-40">
                שלח
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  )
}
