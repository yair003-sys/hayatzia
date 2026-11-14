'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { BadgeCheck, Clapperboard, Play, Search as SearchIcon, Users } from 'lucide-react'
import { teamById } from '@/features/teams/data'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { shortCount } from '@/features/square/schema'
import { searchAction } from '../server/actions'
import { SEARCH_MIN, type FanHit, type PostHit, type SearchResults, type SearchTab } from '../schema'

const EMPTY: SearchResults = { fans: [], posts: [], clips: [] }

export function SearchScreen() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<SearchResults>(EMPTY)
  const [tab, setTab] = useState<SearchTab>('fans')
  const [pending, start] = useTransition()
  // The latest query wins: a slow earlier response must not overwrite a newer one.
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < SEARCH_MIN) {
      setRes(EMPTY)
      return
    }
    const mine = ++seq.current
    const t = setTimeout(() => {
      start(async () => {
        const r = await searchAction({ q: term })
        if (seq.current === mine) setRes(r?.data?.results ?? EMPTY)
      })
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const counts = { fans: res.fans.length, posts: res.posts.length, clips: res.clips.length }
  const total = counts.fans + counts.posts + counts.clips
  const searched = q.trim().length >= SEARCH_MIN

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5">
        <SearchIcon className="size-5 shrink-0 text-muted" aria-hidden="true" />
        <span className="sr-only">חיפוש</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          enterKeyHint="search"
          placeholder="חיפוש אוהדים, פוסטים וסרטונים…"
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </label>

      <nav className="flex gap-2" aria-label="סוג תוצאה">
        {([
          ['fans', 'אנשים', counts.fans],
          ['posts', 'פוסטים', counts.posts],
          ['clips', 'סרטונים', counts.clips],
        ] as const).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === key ? 'bg-accent text-white' : 'border border-line text-muted'}`}
          >
            {label}
            {searched && <span className="ms-1 opacity-70">{n}</span>}
          </button>
        ))}
      </nav>

      {!searched ? (
        <p className="py-16 text-center text-sm text-muted">הקלידו כדי לחפש בכל הליגה — אנשים, פוסטים וסרטונים.</p>
      ) : total === 0 && !pending ? (
        <p className="py-16 text-center text-sm text-muted">לא נמצאו תוצאות ל״{q.trim()}״.</p>
      ) : (
        <div aria-busy={pending}>
          {tab === 'fans' && <FanList fans={res.fans} />}
          {tab === 'posts' && <PostList posts={res.posts} />}
          {tab === 'clips' && <ClipGrid clips={res.clips} />}
        </div>
      )}
    </div>
  )
}

function FanList({ fans }: { fans: FanHit[] }) {
  if (fans.length === 0) return <Empty icon={<Users className="size-6" />} text="אין אנשים מתאימים" />
  return (
    <ul className="space-y-2">
      {fans.map((f) => {
        const team = teamById(f.teamId)
        return (
          <li key={f.userId}>
            <Link href={`/fans/${f.userId}` as Route} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 active:scale-[0.99]">
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-elev text-lg">
                {f.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  f.nick.slice(0, 1)
                )}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{f.nick}</b>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  {team && <TeamScarf team={team} className="h-3.5 w-1.5" />}
                  {team?.name}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted">
                <b className="t-num text-fg">{shortCount(f.followers)}</b> עוקבים
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function PostList({ posts }: { posts: PostHit[] }) {
  if (posts.length === 0) return <Empty icon={<SearchIcon className="size-6" />} text="אין פוסטים מתאימים" />
  return (
    <ul className="space-y-2">
      {posts.map((p) => {
        const team = teamById(p.teamId)
        return (
          <li key={p.id}>
            <Link href={`/fans/${p.authorId}` as Route} className="block rounded-2xl border border-line bg-surface px-3.5 py-3 active:scale-[0.99]">
              <span className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                {team && <TeamScarf team={team} className="h-3.5 w-1.5" />}
                <b className="text-fg">{p.authorNick}</b>
                {p.official && <BadgeCheck className="size-3.5 text-accent-text" aria-label="רשמי" />}
                <span>· {team?.short}</span>
              </span>
              {p.title && <b className="block">{p.title}</b>}
              <p className="line-clamp-3 text-sm text-fg/90">{p.body}</p>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function ClipGrid({ clips }: { clips: SearchResults['clips'] }) {
  if (clips.length === 0) return <Empty icon={<Clapperboard className="size-6" />} text="אין סרטונים מתאימים" />
  return (
    <ul className="grid grid-cols-2 gap-2">
      {clips.map((c) => {
        const team = teamById(c.team_id)
        return (
          <li key={c.id}>
            <Link href={`/square?c=${c.id}` as Route} className="block overflow-hidden rounded-xl border border-line bg-black">
              <span className="relative block aspect-[4/5]">
                {c.url && c.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                ) : c.url ? (
                  <video src={`${c.url}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" aria-hidden="true" />
                ) : null}
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                {c.kind === 'video' && (
                  <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-black/50 text-white">
                    <Play className="size-3.5 translate-x-px fill-white" aria-hidden="true" />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 space-y-0.5 p-2 text-white">
                  <span className="flex items-center gap-1.5">
                    {team && <TeamScarf team={team} className="h-3.5 w-1.5" />}
                    <b className="truncate text-xs drop-shadow">{c.nick}</b>
                  </span>
                  {c.caption && <span className="line-clamp-2 text-[11px] text-white/85">{c.caption}</span>}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-muted">
      <span aria-hidden="true">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  )
}
