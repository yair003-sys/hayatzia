'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImagePlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ACCEPT, MAX_UPLOAD_MB, mediaOf } from '../schema'
import { createClipAction } from '../server/actions'

/** Upload straight from the phone (gallery or camera) to Storage, then publish the post. */
export function UploadClip({ meId }: { meId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [once, setOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  const pick = (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!mediaOf(f.type)) return setError('אפשר להעלות רק תמונה או סרטון')
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return setError(`הקובץ גדול מ־${MAX_UPLOAD_MB}MB`)
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setOpen(true)
  }

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setCaption('')
    setTags('')
    setOnce(false)
    setOpen(false)
  }

  const publish = () => {
    if (!file) return
    const media = mediaOf(file.type)
    if (!media) return
    start(async () => {
      const path = `${meId}/${crypto.randomUUID()}.${media.ext}`
      const { error: upErr } = await createClient()
        .storage.from('clips')
        .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
      if (upErr) return setError('ההעלאה נכשלה. נסה שוב')
      const r = await createClipAction({ path, kind: media.kind, caption, tags, once })
      if (r.data?.ok) {
        reset()
        router.refresh()
      } else {
        setError(r.data?.error ?? 'הפרסום נכשל. נסה שוב')
      }
    })
  }

  return (
    <div className="space-y-2">
      <input ref={gallery} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={camera} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {!open && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => gallery.current?.click()} className="flex items-center justify-center gap-2 rounded-lg bg-accent py-3 font-semibold text-white">
            <ImagePlus className="size-5" aria-hidden="true" />
            העלאה לכיכר
          </button>
          <button type="button" onClick={() => camera.current?.click()} className="flex items-center justify-center gap-2 rounded-lg border border-line py-3 font-semibold">
            <Camera className="size-5" aria-hidden="true" />
            צילום עכשיו
          </button>
        </div>
      )}

      {open && file && preview && (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
          <div className="flex items-center justify-between">
            <b>פוסט חדש · 24 שעות</b>
            <button type="button" aria-label="ביטול" onClick={reset} className="text-muted">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="grid max-h-80 place-items-center overflow-hidden rounded-md bg-elev">
            {file.type.startsWith('video/') ? (
              <video src={preview} controls playsInline className="max-h-80" />
            ) : (
              // Local preview (blob: URL).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="תצוגה מקדימה" className="max-h-80 object-contain" />
            )}
          </div>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="כיתוב (לא חובה)" aria-label="כיתוב" className="w-full rounded-md border border-line bg-elev px-3 py-2" />
          <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={60} placeholder="#דרבי #יציע" aria-label="תגיות" className="w-full rounded-md border border-line bg-elev px-3 py-2" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} className="size-4 accent-accent" />
            חד פעמי: כל אוהד יוכל לצפות פעם אחת בלבד
          </label>
          <button type="button" disabled={pending} onClick={publish} className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50">
            {pending ? 'מעלה…' : 'פרסם בכיכר'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
    </div>
  )
}
