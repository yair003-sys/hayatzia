'use client'

import { useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { shrinkPhoto } from '@/features/square/compress'
import { setProfilePhotoAction } from '../server/actions'

const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_MB = { avatar: 5, cover: 8 } as const

type Kind = 'avatar' | 'cover'

function extOf(type: string): string {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
}

/** Pick a photo → shrink → upload to the public bucket (own folder) → point the profile at it. Optimistic: the new
 *  photo shows at once from a local preview, and swaps to the stored URL when the save returns (reverts on failure). */
function usePhotoUpload(kind: Kind, meId: string, initialUrl: string | null) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const bucket = kind === 'avatar' ? 'avatars' : 'covers'

  const pick = async (file: File | undefined) => {
    setError(null)
    if (!file) return
    if (!ACCEPT.includes(file.type)) return setError('אפשר רק תמונה (JPG, PNG או WEBP)')
    if (file.size > MAX_MB[kind] * 1024 * 1024) return setError(`התמונה גדולה מדי (עד ${MAX_MB[kind]}MB)`)

    const preview = URL.createObjectURL(file)
    const previous = url
    setUrl(preview)
    setBusy(true)
    try {
      const ready = await shrinkPhoto(file)
      const path = `${meId}/${crypto.randomUUID()}.${extOf(ready.type)}`
      const { error: upErr } = await createClient()
        .storage.from(bucket)
        .upload(path, ready, { contentType: ready.type, cacheControl: '3600', upsert: false })
      if (upErr) throw upErr
      const r = await setProfilePhotoAction({ kind, path })
      if (r?.data && 'ok' in r.data) {
        setUrl(r.data.url ?? null)
      } else {
        throw new Error((r?.data && 'error' in r.data && r.data.error) || 'failed')
      }
    } catch {
      setUrl(previous)
      setError('ההעלאה נכשלה. נסה שוב')
    } finally {
      setBusy(false)
      URL.revokeObjectURL(preview)
    }
  }

  const field = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
      hidden
      onChange={(e) => {
        void pick(e.target.files?.[0])
        e.target.value = '' // the same photo can be picked again
      }}
    />
  )
  return { url, busy, error, open: () => input.current?.click(), field }
}

/** The cover ("תמונת נושא"): the fan's photo over the club-coloured gradient, with the onefan mark, the privacy badge,
 *  and a "change cover" button — like the banner on a Facebook profile. */
export function ProfileCover({ meId, initialUrl }: { meId: string; initialUrl: string | null }) {
  const { url, busy, error, open, field } = usePhotoUpload('cover', meId, initialUrl)
  return (
    <div className="relative h-44" style={{ background: 'linear-gradient(135deg, var(--club) -10%, #0b1026 78%)' }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-surface" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <span dir="ltr" className="font-brand text-sm font-extrabold tracking-[-0.02em] text-white/90 drop-shadow">
          onefan
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-bold text-white/90 backdrop-blur">
          <Lock className="size-3" aria-hidden="true" />
          פרטי · רק אתה
        </span>
      </div>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        aria-label="שנה תמונת נושא"
        className="absolute bottom-3 end-3 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-black/45 px-3 text-xs font-bold text-white backdrop-blur disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-3.5" aria-hidden="true" />}
        שנה תמונת נושא
      </button>
      {field}
      {error && (
        <p role="alert" className="absolute inset-x-3 bottom-3 rounded-lg px-3 py-1.5 text-center text-xs font-bold text-white" style={{ background: 'rgb(255 61 87 / 0.95)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

/** The avatar ("תמונת פרופיל"): the fan's photo, or a club-coloured square with their first letter, and a camera
 *  badge to change it. Sized to sit in the header row exactly like the old placeholder (86px, rounded, ring). */
export function ProfileAvatar({ meId, nick, initialUrl }: { meId: string; nick: string; initialUrl: string | null }) {
  const { url, busy, error, open, field } = usePhotoUpload('avatar', meId, initialUrl)
  return (
    <div
      className="relative size-[92px] shrink-0 rounded-[22px] p-[3px] shadow-[0_14px_30px_-12px_rgba(0,0,0,0.8)]"
      style={{ background: 'linear-gradient(150deg, var(--club), var(--club2))' }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full rounded-[19px] object-cover" />
      ) : (
        <span
          className="t-serif grid size-full place-items-center rounded-[19px] text-[38px] text-fg"
          style={{ background: 'radial-gradient(120% 120% at 30% 20%, #2a3350, #141a2b 70%)' }}
          aria-hidden="true"
        >
          {nick.slice(0, 1)}
        </span>
      )}
      <button
        type="button"
        onClick={open}
        disabled={busy}
        aria-label="שנה תמונת פרופיל"
        className="absolute -bottom-1.5 -end-1.5 grid size-[30px] place-items-center rounded-full ring-[3px] ring-surface disabled:opacity-60"
        style={{ background: 'rgb(var(--club-rgb))', color: 'var(--club-text)' }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Camera className="size-3.5" aria-hidden="true" />}
      </button>
      {field}
      {error && (
        <p role="alert" className="absolute start-0 top-full z-10 mt-1 w-40 rounded-lg px-2 py-1 text-[11px] font-bold text-white" style={{ background: 'rgb(255 61 87 / 0.95)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
