'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toString as qrSvg } from 'qrcode'
import { RefreshCw, ScanLine } from 'lucide-react'
import { QR_CODE_RE, qrUrl } from '../schema'
import { resetQrAction } from '../server/actions'

/**
 * "הברקוד שלי" (2026-10-16): a big QR of this fan's add page, drawn on the device (the code is random, never the user
 * id). Another fan scans it with any phone camera at the stadium and lands on /add/<code>. "חדש ברקוד" replaces the
 * code; the old one (and any screenshot of it) stops working at once.
 */
export function MyQr({ code: initial, nick, origin }: { code: string; nick: string; origin?: string }) {
  const [code, setCode] = useState(initial)
  const [src, setSrc] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let cancelled = false
    const url = qrUrl(origin ?? window.location.origin, code)
    void qrSvg(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((svg) => {
      if (!cancelled) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    })
    return () => {
      cancelled = true
    }
  }, [code, origin])

  return (
    <div className="space-y-4">
      <figure className="mx-auto w-full max-w-72 space-y-2 rounded-2xl bg-white p-4 text-center text-black">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL drawn on the device
          <img src={src} alt="הברקוד שלי" className="aspect-square w-full" />
        ) : (
          <div className="skeleton aspect-square w-full rounded-lg" aria-hidden="true" />
        )}
        <figcaption className="text-lg font-bold">{nick}</figcaption>
      </figure>
      <p className="text-center text-sm text-muted">אוהד אחר סורק את הברקוד במצלמה של הטלפון, ויכול לכתוב לך מיד.</p>

      {confirming ? (
        <div role="group" aria-label="חדש ברקוד" className="space-y-2 rounded-lg border border-line p-3">
          <p className="text-sm">הברקוד הנוכחי יפסיק לעבוד, גם אם מישהו צילם אותו. להמשיך?</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
              onClick={() =>
                start(async () => {
                  const r = await resetQrAction()
                  if (r?.data && 'code' in r.data) {
                    setCode(r.data.code)
                    setMsg('נוצר ברקוד חדש')
                  } else setMsg((r?.data && 'error' in r.data ? r.data.error : r?.serverError) ?? 'לא הצלחנו ליצור ברקוד חדש. נסה שוב')
                  setConfirming(false)
                })
              }
            >
              כן, ברקוד חדש
            </button>
            <button type="button" className="min-h-11 rounded-lg border border-line px-4" onClick={() => setConfirming(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="mx-auto flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm" onClick={() => setConfirming(true)}>
          <RefreshCw className="size-4" aria-hidden="true" />
          חדש ברקוד
        </button>
      )}
      {msg && (
        <p role="status" className="text-center text-sm text-muted">
          {msg}
        </p>
      )}
    </div>
  )
}

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (opts: { formats: string[] }) => Detector
const detectorCtor = (): DetectorCtor | undefined => (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector

/** The code inside a scanned text: our add page (any origin, the path decides) or a bare code. */
export function codeFromScan(text: string): string | null {
  const m = /\/add\/([A-Za-z0-9_-]{22,64})(?:[/?#]|$)/.exec(text.trim())
  const code = m?.[1] ?? text.trim()
  return QR_CODE_RE.test(code) ? code : null
}

/**
 * "סרוק ברקוד": the browser's own barcode reader and camera where the phone has them (Chrome on Android); elsewhere the
 * phone camera app is the way (it opens the link by itself). Video stays on the device.
 */
export function QrScanner() {
  const router = useRouter()
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'idle' | 'scanning' | 'unsupported' | 'denied'>('idle')

  useEffect(() => {
    const Ctor = detectorCtor()
    if (state !== 'scanning' || !Ctor) return
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const detector = new Ctor({ formats: ['qr_code'] })
    const tick = async () => {
      if (stopped || !video.current) return
      try {
        const found = await detector.detect(video.current)
        for (const f of found) {
          const code = codeFromScan(f.rawValue)
          if (code) {
            stopped = true
            router.push(`/add/${code}`)
            return
          }
        }
      } catch {
        // a frame that could not be read: try the next one
      }
      timer = setTimeout(() => void tick(), 300)
    }
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s
        if (stopped || !video.current) return
        video.current.srcObject = s
        await video.current.play()
        void tick()
      })
      .catch(() => setState('denied'))
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [state, router])

  return (
    <div className="space-y-2">
      {state === 'scanning' ? (
        <>
          <video ref={video} className="aspect-square w-full rounded-2xl bg-black object-cover" muted playsInline aria-label="מצלמה לסריקת ברקוד" />
          <button type="button" className="min-h-11 w-full rounded-lg border border-line" onClick={() => setState('idle')}>
            עצור סריקה
          </button>
        </>
      ) : (
        <button
          type="button"
          className="su-btn su-btn-blue flex items-center justify-center gap-2"
          onClick={() => setState(detectorCtor() && navigator.mediaDevices?.getUserMedia ? 'scanning' : 'unsupported')}
        >
          <ScanLine className="size-5" aria-hidden="true" />
          סרוק ברקוד
        </button>
      )}
      {state === 'unsupported' && (
        <p role="status" className="text-sm text-muted">
          הדפדפן הזה לא סורק ברקודים. פתח את המצלמה של הטלפון וכוון אותה לברקוד: הקישור ייפתח לבד.
        </p>
      )}
      {state === 'denied' && (
        <p role="alert" className="text-sm text-live">
          אין גישה למצלמה. אפשר לאשר מצלמה בהגדרות הדפדפן, או לסרוק עם המצלמה של הטלפון.
        </p>
      )}
    </div>
  )
}
