'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ImagePlus, Plus, Trash2, Type, Video, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { shrinkPhoto } from '../compress'
import {
  ACCEPT,
  CAPTION_STYLES,
  CLIP_FILTERS,
  CLIP_SPEEDS,
  FILTER_LABEL,
  MAX_CAPTIONS,
  MAX_UPLOAD_MB,
  mediaOf,
  type Audience,
  type CaptionStyle,
  type Clip,
  type ClipCaption,
  type ClipFilter,
} from '../schema'
import { CaptionLayer } from './caption-layer'
import { createClipAction } from '../server/actions'

const STYLE_LABEL: Record<CaptionStyle, string> = { classic: 'קלאסי', bar: 'רצועה', outline: 'קו מתאר', neon: 'ניאון', meme: 'ממים' }
const CAPTION_COLORS = ['#ffffff', '#111111', '#ffe11a', '#ff2d55', '#00e5ff', '#34c759']
const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

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
  /** Hide the Square's own "+" button (the home stories row opens the sheet from its own circle). */
  trigger?: ReactNode
}

/** Pick or shoot, write a caption, publish to the open tab. Photos are shrunk; the upload runs in the background. */
export function UploadClip({ meId, myTeamId, myNick, audience, teamShort, onStart, onDone, choosing, setChoosing, trigger }: Props) {
  // The fan chooses who sees the post; the open tab is only the starting choice.
  const [to, setTo] = useState<Audience>(audience)
  const label = (a: Audience) => (a === 'team' ? `לאוהדי ${teamShort}` : 'לכל הליגה')
  const target = label(to)
  const [sent, setSent] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [captions, setCaptions] = useState<ClipCaption[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [filter, setFilter] = useState<ClipFilter>('none')
  const [speed, setSpeed] = useState(1)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState<number | null>(null)
  const [dur, setDur] = useState(0)
  const previewVideo = useRef<HTMLVideoElement>(null)
  const capInput = useRef<HTMLInputElement>(null)
  const focusCap = () => requestAnimationFrame(() => capInput.current?.focus())
  const isVideo = file?.type.startsWith('video/') ?? false
  const [tags, setTags] = useState('')
  const [once, setOnce] = useState(false)

  // Preview the edits live: speed, and a trim window that loops.
  useEffect(() => {
    const v = previewVideo.current
    if (!v) return
    v.playbackRate = speed
  }, [speed, preview])
  useEffect(() => {
    const v = previewVideo.current
    if (!v) return
    const onMeta = () => setDur(v.duration || 0)
    const onTime = () => {
      const end = trimEnd ?? (v.duration || 0)
      if (end && (v.currentTime < trimStart || v.currentTime >= end)) v.currentTime = trimStart
    }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('timeupdate', onTime)
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('timeupdate', onTime)
    }
  }, [trimStart, trimEnd, preview])

  const addCaption = () => {
    if (captions.length >= MAX_CAPTIONS) return
    // Start in the visible middle of the clip (not behind the bottom controls); the fan drags it where they want.
    setCaptions((cur) => [...cur, { text: 'טקסט', style: 'classic', color: '#ffffff', x: 50, y: 42, size: 1.4 }])
    setSel(captions.length)
    focusCap()
  }
  const patchCaption = (i: number, patch: Partial<ClipCaption>) => setCaptions((cur) => cur.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const removeCaption = (i: number) => {
    setCaptions((cur) => cur.filter((_, j) => j !== i))
    setSel(null)
  }
  const [error, setError] = useState<string | null>(null)
  const gallery = useRef<HTMLInputElement>(null)
  // Phones open the camera directly only when the input asks for ONE kind (photo or video) with `capture`;
  // "image/*,video/*" makes Android fall back to the gallery. So: one input per kind.
  const camera = useRef<HTMLInputElement>(null)
  const recorder = useRef<HTMLInputElement>(null)

  const pick = (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!mediaOf(f.type)) return setError('אפשר להעלות רק תמונה או סרטון')
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return setError(`הקובץ גדול מ־${MAX_UPLOAD_MB}MB`)
    setChoosing(false)
    setTo(audience)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const close = () => {
    setFile(null)
    setPreview(null)
    setCaption('')
    setCaptions([])
    setSel(null)
    setFilter('none')
    setSpeed(1)
    setTrimStart(0)
    setTrimEnd(null)
    setDur(0)
    setTags('')
    setOnce(false)
  }

  const publish = () => {
    if (!file || !preview) return
    const now = new Date()
    const localId = `local-${crypto.randomUUID()}`
    const kind = file.type.startsWith('video/') ? 'video' : 'image'
    const caps = captions.filter((c) => c.text.trim()).map((c) => ({ ...c, text: c.text.trim().slice(0, 80) }))
    onStart({
      id: localId,
      user_id: meId,
      team_id: myTeamId,
      nick: myNick,
      kind,
      caption: caption.trim(),
      captions: caps,
      filter,
      speed,
      trim_start: trimStart,
      trim_end: trimEnd,
      tags: tags.trim(),
      once,
      likes_count: 0,
      respects_count: 0,
      comments_count: 0,
      views_count: 0,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 3600_000).toISOString(),
      audience: to,
      url: preview,
      liked: false,
      respected: false,
      uploading: true,
    })
    const input = { caption, captions: caps, filter, speed: speed as 0.5 | 1 | 1.5 | 2, trimStart, trimEnd, tags, once, audience: to }
    const elsewhere = to !== audience ? `הפוסט עלה ${label(to)} ✓` : null
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
      if (r.data && 'clip' in r.data) {
        if (elsewhere && r.data.clip) {
          setSent(elsewhere)
          setTimeout(() => setSent(null), 3000)
        }
        return onDone(localId, r.data.clip ?? null)
      }
      setError((r.data && 'error' in r.data && r.data.error) || 'הפרסום נכשל. נסה שוב')
      onDone(localId, null)
    })()
  }

  return (
    <>
      <input ref={gallery} type="file" accept={ACCEPT} hidden onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = '' // the same photo can be picked again
        }} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = '' // the same photo can be picked again
        }} />
      <input ref={recorder} type="file" accept="video/*" capture="environment" hidden onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = '' // the same photo can be picked again
        }} />
      {trigger ?? (
        <button type="button" className="sq-plus" aria-label="פוסט חדש" onClick={() => setChoosing(true)}>
          <Plus className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}

      {choosing &&
        !file &&
        createPortal(
        <div className="sq-sheet-wrap" onClick={() => setChoosing(false)}>
          <div className="sq-sheet" role="dialog" aria-label="פוסט חדש" onClick={(e) => e.stopPropagation()}>
            <span className="sq-grip" aria-hidden="true" />
            <p className="text-sm text-muted">פוסט חדש · נעלם אחרי 24 שעות</p>
            <button type="button" className="sq-choice" onClick={() => gallery.current?.click()}>
              <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden="true" />
              בחירה מהגלריה
            </button>
            <button type="button" className="sq-choice" onClick={() => camera.current?.click()}>
              <Camera className="size-5" strokeWidth={1.75} aria-hidden="true" />
              צילום תמונה
            </button>
            <button type="button" className="sq-choice" onClick={() => recorder.current?.click()}>
              <Video className="size-5" strokeWidth={1.75} aria-hidden="true" />
              צילום סרטון
            </button>
          </div>
        </div>,
          document.body,
        )}

      {file &&
        preview &&
        createPortal(
        <div className="sq-compose" role="dialog" aria-label={`פוסט חדש ${target}`}>
          <div className="sq-compose-media">
            {file.type.startsWith('video/') ? (
              <video ref={previewVideo} src={preview} autoPlay muted loop playsInline className={`filt-${filter}`} />
            ) : (
              // Local preview (blob: URL).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="תצוגה מקדימה" className={`filt-${filter}`} />
            )}
            <CaptionLayer
              captions={captions}
              selected={sel}
              onSelect={setSel}
              onMove={(i, x, y) => patchCaption(i, { x, y })}
              onEdit={(i) => {
                setSel(i)
                focusCap()
              }}
            />
          </div>
          <div className="sq-compose-top">
            <button type="button" aria-label="ביטול" onClick={close} className="sq-round">
              <X className="size-5" aria-hidden="true" />
            </button>
            <span className="text-sm text-white/80">{target} · 24 שעות</span>
          </div>

          {/* Caption editor floats near the top so it never hides the caption on the clip; the fan drags the caption and taps it to edit. */}
          {sel !== null && captions[sel] && (
            <div className="sq-cap-float" role="group" aria-label="עריכת כתובית">
              <input
                ref={capInput}
                value={captions[sel]?.text ?? ''}
                onChange={(e) => patchCaption(sel, { text: e.target.value })}
                maxLength={80}
                placeholder="טקסט הכתובית"
                aria-label="טקסט הכתובית"
                className="sq-input"
              />
              <div className="sq-caps-styles">
                {CAPTION_STYLES.map((s) => (
                  <button key={s} type="button" aria-pressed={captions[sel]?.style === s} onClick={() => patchCaption(sel, { style: s })} className={cn('sq-chip', captions[sel]?.style === s && 'on')}>
                    {STYLE_LABEL[s]}
                  </button>
                ))}
              </div>
              <div className="sq-caps-row">
                {CAPTION_COLORS.map((col) => (
                  <button key={col} type="button" aria-label={`צבע ${col}`} onClick={() => patchCaption(sel, { color: col })} className={cn('sq-swatch', captions[sel]?.color === col && 'on')} style={{ background: col }} />
                ))}
                <input type="range" min={0.8} max={3} step={0.1} value={captions[sel]?.size ?? 1.4} onChange={(e) => patchCaption(sel, { size: Number(e.target.value) })} aria-label="גודל הכתובית" className="sq-caps-size" />
                <button type="button" aria-label="מחק כתובית" onClick={() => removeCaption(sel)} className="sq-caps-del">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="sq-cap-float-foot">
                <span className="sq-cap-hint">גוררים את הכתובית למקום, לוחצים עליה לעריכה</span>
                <button type="button" className="sq-cap-done" onClick={() => setSel(null)}>
                  סיום
                </button>
              </div>
            </div>
          )}
          <div className="sq-compose-bottom">
            <div className="sq-edit">
              <div className="sq-edit-row" role="group" aria-label="פילטר">
                {CLIP_FILTERS.map((f) => (
                  <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn('sq-chip', filter === f && 'on')}>
                    {FILTER_LABEL[f]}
                  </button>
                ))}
              </div>
              {isVideo && (
                <div className="sq-edit-row" role="group" aria-label="מהירות">
                  <span className="sq-edit-lbl">מהירות</span>
                  {CLIP_SPEEDS.map((s) => (
                    <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className={cn('sq-chip', speed === s && 'on')}>
                      {s}x
                    </button>
                  ))}
                </div>
              )}
              {isVideo && dur > 0 && (
                <div className="sq-trim">
                  <span className="sq-edit-lbl">
                    חיתוך · {fmtSec(trimStart)}–{fmtSec(trimEnd ?? dur)}
                  </span>
                  <label className="sq-trim-row">
                    <span>התחלה</span>
                    <input type="range" min={0} max={Math.max(0.1, (trimEnd ?? dur) - 0.3)} step={0.1} value={trimStart} onChange={(e) => setTrimStart(Number(e.target.value))} aria-label="נקודת התחלה" />
                  </label>
                  <label className="sq-trim-row">
                    <span>סוף</span>
                    <input
                      type="range"
                      min={trimStart + 0.3}
                      max={dur}
                      step={0.1}
                      value={trimEnd ?? dur}
                      onChange={(e) => setTrimEnd(Number(e.target.value) >= dur ? null : Number(e.target.value))}
                      aria-label="נקודת סוף"
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="sq-caps">
              <button type="button" className="sq-caps-add" onClick={addCaption} disabled={captions.length >= MAX_CAPTIONS}>
                <Type className="size-4" aria-hidden="true" />
                כתובית
              </button>
            </div>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="כיתוב (לא חובה)" aria-label="כיתוב" className="sq-input" />
            <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={60} placeholder="#דרבי #מחזור10" aria-label="תגיות" className="sq-input" />
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-semibold text-white">למי לפרסם?</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['team', 'all'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={to === a}
                    onClick={() => setTo(a)}
                    className={
                      to === a
                        ? 'min-h-11 rounded-xl bg-accent px-3 text-sm font-bold text-white'
                        : 'min-h-11 rounded-xl border border-white/25 bg-black/40 px-3 text-sm text-white/85'
                    }
                  >
                    {a === 'team' ? `רק לאוהדי ${teamShort}` : 'לכל הליגה'}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm text-white/85">
              <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} className="size-4 accent-accent" />
              חד פעמי: כל אוהד יוכל לצפות פעם אחת
            </label>
            <button type="button" onClick={publish} className="su-btn su-btn-blue">
              פרסום {target}
            </button>
          </div>
        </div>,
          document.body,
        )}
      {sent && (
        <p role="status" className="sq-toast bg-ok/95 text-canvas">
          {sent}
        </p>
      )}
      {error && (
        <p role="alert" className="sq-toast">
          {error}
        </p>
      )}
    </>
  )
}
