'use client'

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Images, SwitchCamera, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Audience } from '../schema'

/**
 * Instagram-style live camera that replaces the old "gallery or camera" sheet. A short tap on the shutter takes a
 * photo; a long press records video (release to stop); swiping down opens the gallery. A small audience toggle sits in
 * the corner. If the camera can't be opened (no permission / unsupported), it falls back to a "open gallery" prompt so
 * the fan is never stuck. All capture is client-side; nothing is uploaded until the fan publishes from the editor.
 */
export function CameraCapture({
  onCapture,
  onGallery,
  onClose,
  to,
  setTo,
  teamShort,
}: {
  onCapture: (file: File) => void
  onGallery: () => void
  onClose: () => void
  to: Audience
  setTo: (a: Audience) => void
  teamShort: string
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [recording, setRecording] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Open (and re-open on flip) the camera; always stop the old stream first so the light goes off.
  useEffect(() => {
    let cancelled = false
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('המצלמה לא נתמכת בדפדפן הזה. אפשר להעלות מהגלריה.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true })
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream.current?.getTracks().forEach((t) => t.stop())
        stream.current = s
        setErr(null)
        if (video.current) {
          video.current.srcObject = s
          void video.current.play().catch(() => {})
        }
      } catch {
        setErr('אין גישה למצלמה. אשר/י הרשאה בדפדפן, או העלה/י מהגלריה.')
      }
    }
    void start()
    return () => {
      cancelled = true
    }
  }, [facing])

  // Make sure the camera is released when the screen closes.
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop())
      if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
    },
    [],
  )

  const takePhoto = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')
    if (!ctx) return
    if (facing === 'user') {
      // Un-mirror the selfie so the saved photo matches what others will see.
      ctx.translate(c.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(v, 0, 0)
    c.toBlob(
      (b) => {
        if (b) onCapture(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  const startRec = () => {
    const s = stream.current
    if (!s || typeof MediaRecorder === 'undefined') return
    const types = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    const mime = types.find((t) => {
      try {
        return MediaRecorder.isTypeSupported(t)
      } catch {
        return false
      }
    })
    let r: MediaRecorder
    try {
      r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
    } catch {
      return
    }
    chunks.current = []
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data)
    }
    r.onstop = () => {
      const type = r.mimeType || 'video/webm'
      const ext = type.includes('mp4') ? 'mp4' : 'webm'
      onCapture(new File([new Blob(chunks.current, { type })], `video-${Date.now()}.${ext}`, { type }))
    }
    r.start()
    rec.current = r
    setRecording(true)
  }

  const stopRec = () => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
    rec.current = null
    setRecording(false)
  }

  // Shutter: hold past 280ms starts recording; a quicker release is a photo.
  const shutterDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    held.current = false
    holdTimer.current = setTimeout(() => {
      held.current = true
      startRec()
    }, 280)
  }
  const shutterUp = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    if (held.current) stopRec()
    else takePhoto()
  }

  // Swipe down anywhere on the backdrop (not the controls) opens the gallery.
  const swipeY = useRef<number | null>(null)
  const bgDown = (e: ReactPointerEvent) => {
    if (e.target !== e.currentTarget) return
    swipeY.current = e.clientY
  }
  const bgUp = (e: ReactPointerEvent) => {
    if (swipeY.current !== null && e.clientY - swipeY.current > 80) onGallery()
    swipeY.current = null
  }

  const OPTS: { id: Audience; label: string }[] = [
    { id: 'team', label: teamShort },
    { id: 'all', label: 'הליגה' },
    { id: 'both', label: 'שניהם' },
  ]

  return createPortal(
    <div className="cam" role="dialog" aria-modal="true" aria-label="מצלמה" onPointerDown={bgDown} onPointerUp={bgUp}>
      <video ref={video} className={cn('cam-view', facing === 'user' && 'cam-view--mirror')} muted playsInline autoPlay />

      <div className="cam-top">
        <button type="button" aria-label="סגירה" onClick={onClose} className="sq-round">
          <X className="size-5" aria-hidden="true" />
        </button>
        <button type="button" aria-label="היפוך מצלמה" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} className="sq-round">
          <SwitchCamera className="size-5" aria-hidden="true" />
        </button>
      </div>

      {err ? (
        <div className="cam-err">
          <p>{err}</p>
          <button type="button" className="sq-cap-done" onClick={onGallery}>
            פתח גלריה
          </button>
        </div>
      ) : (
        <p className="cam-hint">לחיצה = תמונה · לחיצה ארוכה = סרטון · החלקה מטה = גלריה</p>
      )}

      <div className="cam-bar">
        <button type="button" aria-label="גלריה" onClick={onGallery} className="cam-gallery">
          <Images className="size-6" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label={recording ? 'עצור הקלטה' : 'צילום (לחיצה ארוכה לסרטון)'}
          className={cn('cam-shutter', recording && 'cam-shutter--rec')}
          onPointerDown={shutterDown}
          onPointerUp={shutterUp}
          onPointerLeave={shutterUp}
          disabled={!!err}
        >
          <span className="cam-shutter-core" />
        </button>

        <div className="cam-aud" role="group" aria-label="למי לפרסם">
          {OPTS.map((o) => (
            <button key={o.id} type="button" aria-pressed={to === o.id} onClick={() => setTo(o.id)} className={cn('cam-aud-chip', to === o.id && 'on')}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
