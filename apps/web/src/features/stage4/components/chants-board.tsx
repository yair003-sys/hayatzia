'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Chant } from '../server/queries'
import { addChantAction, toggleFireAction } from '../server/actions'

const AUDIO_EXT: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }

/** The club's songs; 🔥 for everyone, adding only for the club's fan representative. */
export function ChantsBoard({ initial, isRep, meId, teamShort }: { initial: Chant[]; isRep: boolean; meId: string; teamShort: string }) {
  const [chants, setChants] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)

  const fire = (c: Chant) => {
    const on = !c.fired
    setChants((cur) => cur.map((x) => (x.id === c.id ? { ...x, fired: on, fires: x.fires + (on ? 1 : -1) } : x)))
    void toggleFireAction({ chantId: c.id, on })
  }

  return (
    <div className="space-y-3">
      {isRep && <AddChant meId={meId} />}
      {chants.length === 0 ? (
        <p className="sh-card text-sm text-muted">השירים של {teamShort} יעלו כאן על ידי נציג הקהל.</p>
      ) : (
        <ul className="space-y-2">
          {chants.map((c) => {
            const open = openId === c.id
            return (
              <li key={c.id} className="sh-card gap-2">
                <div className="flex items-center gap-3">
                  <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : c.id)} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                    <span className="text-xl" aria-hidden="true">
                      🎶
                    </span>
                    <b className="truncate font-display text-lg">{c.title}</b>
                    {open ? <ChevronUp className="size-4 text-dim" aria-hidden="true" /> : <ChevronDown className="size-4 text-dim" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    aria-pressed={c.fired}
                    onClick={() => fire(c)}
                    className={cn('flex min-h-10 items-center gap-1 rounded-full border px-3 text-sm font-bold', c.fired ? 'border-warn/60 bg-warn/15 text-warn' : 'border-line text-muted')}
                  >
                    🔥 {c.fires}
                  </button>
                </div>
                {c.audioUrl && <audio controls preload="none" src={c.audioUrl} className="w-full" />}
                {open && c.lyrics && <p className="text-sm leading-relaxed whitespace-pre-line text-muted">{c.lyrics}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AddChant({ meId }: { meId: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  return (
    <form
      className="space-y-2 rounded-2xl border border-accent/40 bg-accent-soft p-3"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          let audioPath: string | undefined
          if (file) {
            const ext = AUDIO_EXT[file.type]
            if (!ext) return setMsg('אפשר להעלות קובץ שמע בלבד')
            audioPath = `${meId}/${crypto.randomUUID()}.${ext}`
            const { error } = await createClient().storage.from('chants').upload(audioPath, file, { contentType: file.type })
            if (error) return setMsg('ההקלטה לא עלתה. נסה שוב')
          }
          const r = await addChantAction({ title, lyrics, audioPath })
          if (r.data && 'ok' in r.data) {
            setTitle('')
            setLyrics('')
            setFile(null)
            setMsg('השיר נוסף ✓')
            router.refresh()
          } else setMsg((r.data && 'error' in r.data && r.data.error) || 'השיר לא נוסף')
        })
      }}
    >
      <b className="text-sm">נציג הקהל · הוספת שיר</b>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required placeholder="שם השיר" aria-label="שם השיר" className="w-full rounded-md border border-line bg-elev px-3 py-2" />
      <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} maxLength={2000} rows={4} placeholder="המילים" aria-label="המילים" className="w-full rounded-md border border-line bg-elev px-3 py-2 text-sm" />
      <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button type="button" onClick={() => input.current?.click()} className="w-full rounded-md border border-line py-2 text-sm">
        {file ? `🎙️ ${file.name}` : '🎙️ הקלטה (לא חובה)'}
      </button>
      <button type="submit" disabled={pending || !title.trim()} className="w-full rounded-xl bg-accent py-2.5 font-bold text-white disabled:opacity-40">
        {pending ? 'מוסיף…' : 'הוספת השיר'}
      </button>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </form>
  )
}
