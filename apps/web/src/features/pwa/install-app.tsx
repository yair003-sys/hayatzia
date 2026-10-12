'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, Share } from 'lucide-react'

type BeforeInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const noop = () => () => {}
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** "Install the app": native prompt on Android/Chrome, short instructions on iPhone. Hidden once installed. */
export function InstallApp() {
  const installed = useSyncExternalStore(noop, isStandalone, () => true)
  const ios = useSyncExternalStore(noop, isIos, () => false)
  const [prompt, setPrompt] = useState<BeforeInstallPrompt | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (installed) return null
  if (prompt) {
    return (
      <button
        type="button"
        onClick={() => void prompt.prompt().then(() => setPrompt(null))}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent bg-accent-soft py-3 font-semibold"
      >
        <Download className="size-5" aria-hidden="true" />
        התקן את היציע בטלפון
      </button>
    )
  }
  if (ios) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
        <Share className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        להתקנה באייפון: לחץ על כפתור השיתוף בספארי, ואז &quot;הוסף למסך הבית&quot;.
      </p>
    )
  }
  return null
}
