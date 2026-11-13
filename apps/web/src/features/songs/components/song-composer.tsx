'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square, Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MAX_AUDIO_MB, type Song } from '../schema'
import { createSongAction } from '../server/actions'

/** Record a chant you wrote (or upload an audio file), add the lyrics, and send it to the greenhouse. */
export function SongComposer({ meId, onPublished, onClose }: { meId: string; onPublished: (s: Song) => void; onClose: () => void }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const canRecord = typeof window !== 'undefined' && !!navigator.mediaDevices && typeof MediaRecorder !== 'undefined'
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(
    () => () => {
      clearInterval(timer.current)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  const setClip = (b: Blob) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setBlob(b)
    setPreviewUrl(URL.createObjectURL(b))
  }
  const discard = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setBlob(null)
    setPreviewUrl(null)
    setSeconds(0)
  }

  const startRec = async () => {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunks.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data)
      }
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        clearInterval(timer.current)
        setClip(new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }))
      }
      mr.start()
      rec.current = mr
      setSeconds(0)
      setRecording(true)
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setErr('צריך לאשר גישה למיקרופון כדי להקליט')
    }
  }
  const stopRec = () => {
    rec.current?.stop()
    setRecording(false)
  }

  const pickFile = (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_AUDIO_MB * 1024 * 1024) {
      setErr(`הקובץ גדול מדי (עד ${MAX_AUDIO_MB}MB)`)
      return
    }
    setErr(null)
    setClip(f)
  }

  const publish = async () => {
    if (!blob || !lyrics.trim()) {
      setErr('צריך הקלטה והמילים')
      return
    }
    setBusy(true)
    setErr(null)
    const ext = blob.type.includes('mp4') || blob.type.includes('m4a') ? 'm4a' : blob.type.includes('mpeg') ? 'mp3' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    const path = `${meId}/${crypto.randomUUID()}.${ext}`
    const supabase = createClient()
    if (!supabase) {
      setErr('השרת לא זמין כרגע')
      setBusy(false)
      return
    }
    const up = await supabase.storage.from('songs').upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false })
    if (up.error) {
      setErr('ההעלאה נכשלה, נסו שוב')
      setBusy(false)
      return
    }
    const r = await createSongAction({ path, title: title.trim(), lyrics: lyrics.trim() })
    setBusy(false)
    if (r.data?.ok && r.data.song) {
      onPublished(r.data.song)
    } else {
      await supabase.storage.from('songs').remove([path])
      setErr(r.data?.error ?? 'הפרסום נכשל')
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(1, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <b className="text-base">שיר חדש ליציע</b>
        <button type="button" onClick={onClose} className="text-sm text-muted">
          סגור
        </button>
      </div>

      {/* record / preview */}
      {!blob ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-2 py-6">
          {canRecord ? (
            <>
              <button
                type="button"
                onClick={recording ? stopRec : startRec}
                aria-label={recording ? 'עצור הקלטה' : 'התחל הקלטה'}
                className="grid size-16 place-items-center rounded-full text-white shadow-lg transition-transform active:scale-95"
                style={{ background: recording ? 'var(--color-live)' : 'linear-gradient(150deg, var(--acc2, var(--color-accent-2)), var(--acc, var(--color-accent)))' }}
              >
                {recording ? <Square className="size-6" aria-hidden="true" /> : <Mic className="size-7" aria-hidden="true" />}
              </button>
              <span className="text-sm font-bold tabular-nums">{recording ? `מקליט… ${mm}:${ss}` : 'הקש להקלטה'}</span>
            </>
          ) : (
            <span className="text-sm text-muted">ההקלטה לא נתמכת במכשיר הזה — העלו קובץ אודיו</span>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <Upload className="size-3.5" aria-hidden="true" />
            או העלו קובץ אודיו
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={previewUrl ?? undefined} controls className="min-w-0 flex-1" />
          <button type="button" onClick={discard} aria-label="מחק הקלטה" className="grid size-9 shrink-0 place-items-center rounded-full text-muted">
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder="שם השיר (לא חובה)"
        className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-line-strong"
      />
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        maxLength={2000}
        rows={4}
        placeholder="מילות השיר…"
        className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-line-strong"
      />

      {err && (
        <p role="alert" className="text-xs text-live">
          {err}
        </p>
      )}

      <button
        type="button"
        onClick={() => void publish()}
        disabled={busy || !blob || !lyrics.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold text-[var(--acc-on,#fff)] disabled:opacity-50"
        style={{ background: 'linear-gradient(150deg, var(--acc2, var(--color-accent-2)), var(--acc, var(--color-accent)))' }}
      >
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        פרסם ליציע
      </button>
    </div>
  )
}
