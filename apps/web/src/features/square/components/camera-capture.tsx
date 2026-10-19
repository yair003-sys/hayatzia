'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Images, SwitchCamera, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Audience } from '../schema'

// Highest practical capture: ask for a lot and let the browser clamp to the device's best. A stadium clip of a player
// far away needs both the resolution and the zoom.
const IDEAL_W = 2560
const IDEAL_H = 1440
const DIGITAL_MAX = 5 // cap for the software-crop fallback (no native lens zoom)

type ZoomCap = { min: number; max: number; step: number; native: boolean }

/** Pinch distance between the two active pointers. */
function pinchDist(pts: Map<number, { x: number; y: number }>): number {
  const [a, b] = [...pts.values()]
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Instagram-style live camera. A short tap on the shutter takes a photo; a long press records video (release to stop);
 * swiping down opens the gallery. Pinch with two fingers to zoom — the real lens where the device supports it, a sharp
 * software crop otherwise — so a fan can zoom in on a player from the stands. A small audience toggle sits in the
 * corner. If the camera can't be opened it falls back to an "open gallery" prompt so the fan is never stuck.
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
  const track = useRef<MediaStreamTrack | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)
  const aborted = useRef(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [recording, setRecording] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Zoom: `zoom` is the factor shown and used for the software crop; `zoomCap` says the device's range and whether the
  // real lens can do it. When native, the stream itself is zoomed (so photos and videos get it for free); otherwise the
  // preview is scaled and the photo is cropped to match.
  const [zoom, setZoom] = useState(1)
  const [nativeZoom, setNativeZoom] = useState(false)
  const zoomRef = useRef(1)
  const zoomCap = useRef<ZoomCap>({ min: 1, max: DIGITAL_MAX, step: 0.1, native: false })
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  const applyZoom = useCallback((z: number) => {
    const cap = zoomCap.current
    const clamped = Math.min(cap.max, Math.max(cap.min, z))
    zoomRef.current = clamped
    setZoom(clamped)
    if (cap.native && track.current) {
      // `zoom` isn't in the standard constraint types yet, but browsers that report the capability accept it.
      track.current.applyConstraints({ advanced: [{ zoom: clamped }] } as unknown as MediaTrackConstraints).catch(() => {})
    }
  }, [])

  // Open (and re-open on flip / retry) the camera; always stop the old stream first so the light goes off.
  useEffect(() => {
    let cancelled = false
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('הדפדפן הזה לא תומך במצלמה — אי אפשר להעלות מהמכשיר הזה.')
        return
      }
      const videoConstraints = { facingMode: facing, width: { ideal: IDEAL_W }, height: { ideal: IDEAL_H }, frameRate: { ideal: 30 } }
      let s: MediaStream | null = null
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true })
      } catch {
        try {
          s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints })
        } catch {
          s = null
        }
      }
      if (!s) {
        setErr('כדי להעלות צריך לאשר גישה למצלמה. אם כבר דחית — אשר/י ידנית בהגדרות האתר בדפדפן, ואז נסה/י שוב.')
        return
      }
      if (cancelled) {
        s.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = s
      const vt = s.getVideoTracks()[0] ?? null
      track.current = vt
      // Detect real lens zoom; fall back to a software crop when the device doesn't expose it (e.g. iOS Safari).
      const caps = (vt?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { zoom?: { min: number; max: number; step: number } }
      zoomCap.current = caps.zoom
        ? { min: caps.zoom.min || 1, max: Math.min(caps.zoom.max, 8), step: caps.zoom.step || 0.1, native: true }
        : { min: 1, max: DIGITAL_MAX, step: 0.1, native: false }
      zoomRef.current = zoomCap.current.min
      setZoom(zoomCap.current.min)
      setNativeZoom(zoomCap.current.native)
      setErr(null)
      if (video.current) {
        video.current.srcObject = s
        void video.current.play().catch(() => {})
      }
    }
    void start()
    return () => {
      cancelled = true
    }
  }, [facing, attempt])

  useEffect(
    () => () => {
      aborted.current = true
      if (holdTimer.current) clearTimeout(holdTimer.current)
      stream.current?.getTracks().forEach((t) => t.stop())
      if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
    },
    [],
  )

  const takePhoto = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const z = zoomCap.current.native ? 1 : zoomRef.current // native zoom is already in the frame
    const sw = v.videoWidth / z
    const sh = v.videoHeight / z
    const sx = (v.videoWidth - sw) / 2
    const sy = (v.videoHeight - sh) / 2
    const c = document.createElement('canvas')
    c.width = Math.round(sw)
    c.height = Math.round(sh)
    const ctx = c.getContext('2d')
    if (!ctx) return
    if (facing === 'user') {
      ctx.translate(c.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height)
    c.toBlob(
      (b) => {
        if (b) onCapture(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.95,
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
      // A high bitrate keeps a zoomed stadium clip sharp.
      r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 8_000_000 })
    } catch {
      try {
        r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
      } catch {
        return
      }
    }
    chunks.current = []
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data)
    }
    r.onstop = () => {
      if (aborted.current || chunks.current.length === 0) return
      const isMp4 = (r.mimeType || '').includes('mp4')
      const base = isMp4 ? 'video/mp4' : 'video/webm'
      const ext = isMp4 ? 'mp4' : 'webm'
      onCapture(new File([new Blob(chunks.current, { type: base })], `video-${Date.now()}.${ext}`, { type: base }))
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

  const shutterDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
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

  // Backdrop pointers do double duty: two fingers pinch-zoom, one finger swipes down to the gallery.
  const swipeY = useRef<number | null>(null)
  const bgDown = (e: ReactPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      pinch.current = { dist: pinchDist(pointers.current), zoom: zoomRef.current }
      swipeY.current = null
    } else if (e.target === e.currentTarget) {
      swipeY.current = e.clientY
    }
  }
  const bgMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size >= 2) {
      const d = pinchDist(pointers.current)
      if (pinch.current.dist > 0) applyZoom(pinch.current.zoom * (d / pinch.current.dist))
    }
  }
  const bgUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (!err && swipeY.current !== null && e.clientY - swipeY.current > 80) onGallery()
    swipeY.current = null
  }

  const OPTS: { id: Audience; label: string }[] = [
    { id: 'team', label: teamShort },
    { id: 'all', label: 'הליגה' },
    { id: 'both', label: 'שניהם' },
  ]

  // Software zoom scales the preview; native zoom is already in the stream, so leave the element at 1×.
  const digital = !nativeZoom && zoom > 1 ? zoom : 1
  const viewStyle: CSSProperties = {
    transform: facing === 'user' ? `scaleX(${-digital}) scaleY(${digital})` : `scale(${digital})`,
  }

  return createPortal(
    <div
      className="cam"
      role="dialog"
      aria-modal="true"
      aria-label="מצלמה"
      onPointerDown={bgDown}
      onPointerMove={bgMove}
      onPointerUp={bgUp}
      onPointerCancel={bgUp}
    >
      <video ref={video} className="cam-view" style={viewStyle} muted playsInline autoPlay />

      <div className="cam-top">
        <button type="button" aria-label="סגירה" onClick={onClose} className="sq-round">
          <X className="size-5" aria-hidden="true" />
        </button>
        {zoom > 1.05 && (
          <span className="cam-zoom" aria-hidden="true">
            {zoom.toFixed(1)}×
          </span>
        )}
      </div>

      {err ? (
        <div className="cam-err">
          <p>{err}</p>
          <button type="button" className="sq-cap-done" onClick={() => setAttempt((a) => a + 1)}>
            נסה שוב
          </button>
        </div>
      ) : (
        <div className="cam-controls">
          <p className="cam-hint">החזק לסרטון · צבוט לזום · החלק מטה לגלריה</p>
          <div className="cam-aud" role="group" aria-label="למי לפרסם">
            {OPTS.map((o) => (
              <button key={o.id} type="button" aria-pressed={to === o.id} onClick={() => setTo(o.id)} className={cn('cam-aud-chip', to === o.id && 'on')}>
                {o.label}
              </button>
            ))}
          </div>
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
              onPointerCancel={shutterUp}
            >
              <span className="cam-shutter-core" />
            </button>
            <button type="button" aria-label="היפוך מצלמה" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} className="sq-round cam-flip">
              <SwitchCamera className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
