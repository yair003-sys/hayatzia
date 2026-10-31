'use client'

import { useState } from 'react'
import { Check, Share2 } from 'lucide-react'

/** "שתף פרופיל": share a link to onefan via the OS share sheet, falling back to copying it. The dedicated public
 *  profile page (what this will point at) comes with the public-card stage; for now it shares the app link. */
export function ShareProfile({ nick }: { nick: string }) {
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://hayatzia-flame.vercel.app'
    const text = `${nick} · onefan`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'onefan', text, url })
        return
      }
    } catch {
      /* the fan dismissed the share sheet — nothing to do */
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — leave the button as it was */
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-bold"
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
      {copied ? 'הקישור הועתק' : 'שתף פרופיל'}
    </button>
  )
}
