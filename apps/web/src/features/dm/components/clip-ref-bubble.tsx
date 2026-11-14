'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { Clapperboard, Play } from 'lucide-react'
import { getClipRefAction } from '@/features/square/server/actions'
import { teamById } from '@/features/teams/data'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import type { ClipRef } from '../clip-ref'

/**
 * A Square clip shared into a private chat. The message itself only carries the clip's id (encrypted); this card
 * fetches the clip on the device, under the same row-level security as the Square, and links through to watch it.
 */
export function ClipRefBubble({ clipId, mine }: { clipId: string; mine: boolean }) {
  const [state, setState] = useState<'loading' | 'gone' | ClipRef>('loading')

  useEffect(() => {
    let live = true
    void getClipRefAction({ clipId })
      .then((r) => {
        if (!live) return
        setState(r?.data?.ref ?? 'gone')
      })
      .catch(() => live && setState('gone'))
    return () => {
      live = false
    }
  }, [clipId])

  const frame = mine ? 'border-white/25 bg-white/10' : 'border-line bg-surface'

  if (state === 'loading') {
    return <span className={`block w-44 rounded-xl border ${frame} p-3`}><span className="skeleton block h-24 rounded-lg" aria-hidden="true" /></span>
  }
  if (state === 'gone') {
    return (
      <span className={`flex w-44 items-center gap-2 rounded-xl border ${frame} p-3 text-xs opacity-80`}>
        <Clapperboard className="size-4 shrink-0" aria-hidden="true" />
        הסרטון מהכיכר כבר לא זמין
      </span>
    )
  }

  const ref = state
  const team = teamById(ref.teamId)
  const label = ref.kind === 'video' ? 'סרטון מהכיכר' : 'תמונה מהכיכר'
  return (
    <Link href={`/square?c=${ref.id}` as Route} className={`block w-44 overflow-hidden rounded-xl border ${frame}`} aria-label={`${label} של ${ref.nick} — צפייה בכיכר`}>
      <span className="relative block aspect-[4/5] bg-black">
        {ref.url && ref.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ref.url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : ref.url && ref.kind === 'video' ? (
          <video src={`${ref.url}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" aria-hidden="true" />
        ) : null}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            {ref.kind === 'video' ? <Play className="size-5 translate-x-px fill-white" aria-hidden="true" /> : <Clapperboard className="size-5" aria-hidden="true" />}
          </span>
        </span>
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-2 text-white">
          {team && <TeamScarf team={team} className="h-4 w-1.5" />}
          <b className="truncate text-xs drop-shadow">{ref.nick}</b>
        </span>
      </span>
      <span className="block px-2.5 py-1.5">
        <span className="block text-xs font-semibold">{label}</span>
        {ref.caption && <span className="mt-0.5 block truncate text-[11px] opacity-75">{ref.caption}</span>}
      </span>
    </Link>
  )
}
