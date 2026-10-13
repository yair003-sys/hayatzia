'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, MessageCirclePlus, Search, Users, X } from 'lucide-react'
import { GROUP_MAX } from '../schema'
import { createGroupAction, openThreadAction, searchTeammatesAction } from '../server/actions'
import { Avatar } from './avatar'

export type SheetMode = 'menu' | 'dm' | 'group'
type Fan = { user_id: string; nick: string }

const PICK_MAX = GROUP_MAX - 1 // everyone besides me

/** Bottom sheet behind the "+" button: start a private chat, or open a small group. */
export function NewSheet({ mode, onMode }: { mode: SheetMode | null; onMode: (m: SheetMode | null) => void }) {
  if (!mode) return null
  return createPortal(
    <div
      className="sq-sheet-wrap"
      onClick={() => onMode(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onMode(null)
      }}
    >
      <div
        className="sq-sheet ib-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'group' ? 'קבוצה חדשה' : mode === 'dm' ? 'שיחה חדשה' : 'חדש'}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="sq-grip" aria-hidden="true" />
        {mode === 'menu' && (
          <>
            <button type="button" className="sq-choice" onClick={() => onMode('dm')}>
              <MessageCirclePlus className="size-5 text-accent-text" strokeWidth={1.75} aria-hidden="true" />
              שיחה חדשה
            </button>
            <button type="button" className="sq-choice" onClick={() => onMode('group')}>
              <Users className="size-5 text-accent-text" strokeWidth={1.75} aria-hidden="true" />
              קבוצה חדשה
              <span className="ms-auto text-xs font-normal text-dim">עד {GROUP_MAX} אוהדים</span>
            </button>
          </>
        )}
        {mode === 'dm' && <NewChat onBack={() => onMode('menu')} />}
        {mode === 'group' && <NewGroup onBack={() => onMode('menu')} />}
      </div>
    </div>,
    document.body,
  )
}

function SheetHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack} aria-label="חזרה" className="ib-icon-btn">
        <ChevronLeft className="size-5 -scale-x-100" aria-hidden="true" />
      </button>
      <h2 className="t-sec">{title}</h2>
    </div>
  )
}

/** Teammate search shared by both flows. Newest answer wins when the fan types fast. */
function useTeammates() {
  const [q, setQ] = useState('')
  const [fans, setFans] = useState<Fan[] | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const n = ++seq.current
    void searchTeammatesAction({ q: '' }).then((r) => {
      if (n === seq.current) setFans(r?.data?.fans ?? [])
    })
  }, [])

  const search = (value: string) => {
    setQ(value)
    const n = ++seq.current
    void searchTeammatesAction({ q: value }).then((r) => {
      if (n === seq.current) setFans(r?.data?.fans ?? [])
    })
  }
  return { q, fans, search }
}

function SearchField({ q, onChange }: { q: string; onChange: (v: string) => void }) {
  return (
    <label className="ib-search ib-search-sheet">
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">חיפוש אוהד</span>
      <input value={q} onChange={(e) => onChange(e.target.value)} maxLength={20} placeholder="חפש אוהד מהקבוצה לפי כינוי" />
    </label>
  )
}

function NewChat({ onBack }: { onBack: () => void }) {
  const { q, fans, search } = useTeammates()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const open = (f: Fan) =>
    start(async () => {
      setError(null)
      const r = await openThreadAction({ otherId: f.user_id })
      if (r?.data?.error) setError(r.data.error)
      else if (r?.serverError) setError(r.serverError)
    })

  return (
    <>
      <SheetHead title="שיחה חדשה" onBack={onBack} />
      <SearchField q={q} onChange={search} />
      <FanList fans={fans}>
        {(f) => (
          <button type="button" disabled={pending} onClick={() => open(f)} className="ib-pick">
            <Avatar id={f.user_id} name={f.nick} size="sm" />
            <span className="truncate">{f.nick}</span>
          </button>
        )}
      </FanList>
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
    </>
  )
}

function NewGroup({ onBack }: { onBack: () => void }) {
  const { q, fans, search } = useTeammates()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Fan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const full = picked.length >= PICK_MAX
  const ready = name.trim().length >= 2 && picked.length > 0

  const toggle = (f: Fan) =>
    setPicked((cur) => (cur.some((p) => p.user_id === f.user_id) ? cur.filter((p) => p.user_id !== f.user_id) : cur.length >= PICK_MAX ? cur : [...cur, f]))

  const create = () =>
    start(async () => {
      setError(null)
      const r = await createGroupAction({ name: name.trim(), memberIds: picked.map((p) => p.user_id) })
      if (r?.data?.error) setError(r.data.error)
      else if (r?.validationErrors) setError(r.validationErrors.name?._errors?.[0] ?? 'בדוק את הפרטים')
      else if (r?.serverError) setError(r.serverError)
    })

  return (
    <>
      <SheetHead title="קבוצה חדשה" onBack={onBack} />
      <label className="block">
        <span className="sr-only">שם הקבוצה</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="שם הקבוצה, למשל נוסעים לב״ש" className="ib-input" />
      </label>

      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="נבחרו">
          {picked.map((p) => (
            <li key={p.user_id}>
              <button type="button" className="ib-chip" onClick={() => toggle(p)} aria-label={`הסר את ${p.nick}`}>
                {p.nick}
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-dim">
        נבחרו <span className="t-num">{picked.length}</span> מתוך <span className="t-num">{PICK_MAX}</span>
        {full && ' · הקבוצה מלאה'}
      </p>

      <SearchField q={q} onChange={search} />
      <FanList fans={fans}>
        {(f) => {
          const on = picked.some((p) => p.user_id === f.user_id)
          return (
            <button type="button" disabled={!on && full} aria-pressed={on} onClick={() => toggle(f)} className="ib-pick">
              <Avatar id={f.user_id} name={f.nick} size="sm" />
              <span className="truncate">{f.nick}</span>
              <span className="ib-check" data-on={on} aria-hidden="true">
                {on && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </button>
          )
        }}
      </FanList>

      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
      <button type="button" disabled={!ready || pending} onClick={create} className="su-btn su-btn-blue">
        פתיחת הקבוצה
      </button>
    </>
  )
}

function FanList({ fans, children }: { fans: Fan[] | null; children: (f: Fan) => React.ReactNode }) {
  if (fans === null) return <div className="skeleton h-24 rounded-xl" aria-hidden="true" />
  if (fans.length === 0) return <p className="px-1 py-3 text-sm text-muted">לא נמצאו אוהדים</p>
  return (
    <ul className="ib-fans">
      {fans.map((f) => (
        <li key={f.user_id}>{children(f)}</li>
      ))}
    </ul>
  )
}
