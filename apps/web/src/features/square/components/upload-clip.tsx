'use client'

import { useRef, useState } from 'react'
import { Camera, ImagePlus, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { shrinkPhoto } from '../compress'
import { ACCEPT, MAX_UPLOAD_MB, mediaOf, type Audience, type Clip } from '../schema'
import { createClipAction } from '../server/actions'

type Props = {
  meId: string
  myTeamId: string
  myNick: string
  audience: Audience
  teamShort: string
  /** The post appears at once from the phone; `onDone` swaps in the published post (or removes it on failure). */
  onStart: (local: Clip) => void
  onDone: (localId: string, clip: Clip | null) => void
  /** The "gallery or camera" sheet; the feed opens it too (from the empty state). */
  choosing: boolean
  setChoosing: (open: boolean) => void
}

/** Pick or shoot, write a caption, publish to the open tab. Photos are shrunk; the upload runs in the background. */
export function UploadClip({ meId, myTeamId, myNick, audience, teamShort, onStart, onDone, choosing, setChoosing }: Props) {
  const target = audience === 'team' ? `לאוהדי ${teamShort}` : 'לכל הליגה'
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [once, setOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  const pick = (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!mediaOf(f.type)) return setError('אפשר להעלות רק תמונה או סרטון')
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return setError(`הקובץ גדול מ־${MAX_UPLOAD_MB}MB`)
    setChoosing(false)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const close = () => {
    setFile(null)
    setPreview(null)
    setCaption('')
    setTags('')
    setOnce(false)
  }

  const publish = () => {
    if (!file || !preview) return
    const now = new Date()
    const localId = `local-${crypto.randomUUID()}`
    const kind = file.type.startsWith('video/') ? 'video' : 'image'
    onStart({
      id: localId,
      user_id: meId,
      team_id: myTeamId,
      nick: myNick,
      kind,
      caption: caption.trim(),
      tags: tags.trim(),
      once,
      likes_count: 0,
      respects_count: 0,
      comments_count: 0,
      views_count: 0,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 3600_000).toISOString(),
      audience,
      url: preview,
      liked: false,
      respected: false,
      uploading: true,
    })
    const input = { caption, tags, once, audience }
    const original = file
    close()
    void (async () => {
      const ready = await shrinkPhoto(original)
      const media = mediaOf(ready.type)
      if (!media) return onDone(localId, null)
      const path = `${meId}/${crypto.randomUUID()}.${media.ext}`
      const { error: upErr } = await createClient()
        .storage.from('clips')
        .upload(path, ready, { contentType: ready.type, cacheControl: '3600', upsert: false })
      if (upErr) {
        setError('ההעלאה נכשלה. נסה שוב')
        return onDone(localId, null)
      }
      const r = await createClipAction({ path, kind: media.kind, ...input })
      if (r.data && 'clip' in r.data) return onDone(localId, r.data.clip ?? null)
      setError((r.data && 'error' in r.data && r.data.error) || 'הפרסום נכשל. נסה שוב')
      onDone(localId, null)
    })()
  }

  return (
    <>
      <input ref={gallery} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={camera} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="sq-plus" aria-label={`פוסט חדש ${target}`} onClick={() => setChoosing(true)}>
        <Plus className="size-5" strokeWidth={2.2} aria-hidden="true" />
      </button>

      {choosing && !file && (
        <div className="sq-sheet-wrap" onClick={() => setChoosing(false)}>
          <div className="sq-sheet" role="dialog" aria-label="פוסט חדש" onClick={(e) => e.stopPropagation()}>
            <span className="sq-grip" aria-hidden="true" />
            <p className="text-sm text-muted">
              פוסט חדש <b className="font-semibold text-fg">{target}</b> · נעלם אחרי 24 שעות
            </p>
            <button type="button" className="sq-choice" onClick={() => gallery.current?.click()}>
              <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden="true" />
              בחירה מהגלריה
            </button>
            <button type="button" className="sq-choice" onClick={() => camera.current?.click()}>
              <Camera className="size-5" strokeWidth={1.75} aria-hidden="true" />
              צילום עכשיו
            </button>
          </div>
        </div>
      )}

      {file && preview && (
        <div className="sq-compose" role="dialog" aria-label={`פוסט חדש ${target}`}>
          <div className="sq-compose-media">
            {file.type.startsWith('video/') ? (
              <video src={preview} autoPlay muted loop playsInline />
            ) : (
              // Local preview (blob: URL).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="תצוגה מקדימה" />
            )}
          </div>
          <div className="sq-compose-top">
            <button type="button" aria-label="ביטול" onClick={close} className="sq-round">
              <X className="size-5" aria-hidden="true" />
            </button>
            <span className="text-sm text-white/80">{target} · 24 שעות</span>
          </div>
          <div className="sq-compose-bottom">
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="כיתוב (לא חובה)" aria-label="כיתוב" className="sq-input" />
            <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={60} placeholder="#דרבי #מחזור10" aria-label="תגיות" className="sq-input" />
            <label className="flex items-center gap-2 text-sm text-white/85">
              <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} className="size-4 accent-accent" />
              חד פעמי: כל אוהד יוכל לצפות פעם אחת
            </label>
            <button type="button" onClick={publish} className="su-btn su-btn-blue">
              פרסום {target}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="sq-toast">
          {error}
        </p>
      )}
    </>
  )
}
