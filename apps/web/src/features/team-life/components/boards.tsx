'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, MessageSquare, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { openThreadAction } from '@/features/dm/server/actions'
import { CONDITION, departureLabel, EVENT_KIND, MARKET_CAT, TRIP_KIND } from '../schema'
import type { FanEvent, MarketItem, Trip } from '../server/queries'
import {
  createEventAction,
  createItemAction,
  createTripAction,
  decideSeatAction,
  deleteEventAction,
  deleteItemAction,
  deleteTripAction,
  goingAction,
  markSoldAction,
  requestSeatAction,
} from '../server/actions'

type Result = { data?: { ok?: true; error?: string } | undefined; serverError?: string; validationErrors?: unknown }
const errorOf = (r: Result) => r.data?.error ?? r.serverError ?? (r.validationErrors ? 'בדוק את הפרטים' : null)

function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn()
      const e = errorOf(r)
      setError(e)
      if (!e) {
        after?.()
        router.refresh()
      }
    })
  return { pending, error, run }
}

function MessageTo({ userId, label = 'הודעה' }: { userId: string; label?: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await openThreadAction({ otherId: userId })))}
      className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs"
    >
      <MessageSquare className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  )
}
const input = 'w-full rounded-md border border-line bg-elev px-3 py-2'

// ---------------- trips ----------------
export type MatchOption = { id: number; label: string; kickoff: number }

export function TripsBoard({ matches, trips, meId }: { matches: MatchOption[]; trips: Trip[]; meId: string }) {
  const [fixtureId, setFixtureId] = useState(matches[0]?.id)
  const [form, setForm] = useState(false)
  const { pending, error, run } = useRun()
  const match = matches.find((m) => m.id === fixtureId)
  const list = trips.filter((t) => t.fixture_id === fixtureId)

  if (!match) return <p className="py-8 text-center text-muted">אין משחקים קרובים של הקבוצה כרגע.</p>

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {matches.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={m.id === fixtureId}
            onClick={() => setFixtureId(m.id)}
            className={cn('shrink-0 rounded-full border px-3 py-1.5 text-sm', m.id === fixtureId ? 'border-accent bg-accent-soft' : 'border-line text-muted')}
          >
            {m.label}
          </button>
        ))}
      </div>

      {form ? (
        <form
          className="space-y-3 rounded-lg border border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(
              () =>
                createTripAction({
                  fixtureId: match.id,
                  kind: f.get('kind') as 'offer',
                  fromCity: String(f.get('from')),
                  departBeforeMin: Number(f.get('before')),
                  seats: Number(f.get('seats')),
                  cost: f.get('cost') as 'share',
                  note: String(f.get('note')),
                }),
              () => setForm(false),
            )
          }}
        >
          <Field label="סוג">
            <select name="kind" className={input}>
              {Object.entries(TRIP_KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="יוצאים מ־">
            <input name="from" required maxLength={40} placeholder="למשל: חיפה" className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="כמה לפני המשחק">
              <select name="before" defaultValue="120" className={input}>
                {[60, 90, 120, 150, 180, 240].map((m) => (
                  <option key={m} value={m}>
                    {m / 60} שע׳ ({departureLabel(match.kickoff, m)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="מקומות פנויים">
              <input name="seats" type="number" min={0} max={8} defaultValue={3} className={input} />
            </Field>
          </div>
          <Field label="עלות">
            <select name="cost" className={input}>
              <option value="share">השתתפות בדלק</option>
              <option value="free">בלי עלות</option>
            </select>
          </Field>
          <Field label="הערה">
            <input name="note" maxLength={140} placeholder="לא חובה" className={input} />
          </Field>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-accent py-2.5 font-semibold text-white">
              פרסם
            </button>
            <button type="button" onClick={() => setForm(false)} className="rounded-lg border border-line px-4">
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setForm(true)} className="w-full rounded-lg bg-accent py-3 font-semibold text-white">
          + נסיעה חדשה
        </button>
      )}
      {error && <p role="alert" className="text-sm text-live">{error}</p>}

      {list.length === 0 && <p className="py-6 text-center text-muted">עוד אין נסיעות למשחק הזה.</p>}
      <ul className="space-y-3">
        {list.map((t) => {
          const mine = t.user_id === meId
          const myReq = t.requests.find((r) => r.user_id === meId)
          const accepted = t.requests.filter((r) => r.status === 'accepted').length
          const free = Math.max(t.seats - accepted, 0)
          return (
            <li key={t.id} className="space-y-2 rounded-lg border border-line-soft bg-surface p-3">
              <div className="flex items-center gap-2">
                <b>{t.nick}</b>
                <span className="text-xs text-accent-text">{TRIP_KIND[t.kind]}</span>
                {mine && (
                  <button type="button" aria-label="מחק נסיעה" onClick={() => run(() => deleteTripAction({ id: t.id }))} className="ms-auto text-dim">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="text-sm">
                מ{t.from_city} · יציאה {departureLabel(match.kickoff, t.depart_before_min)}
                {t.kind === 'offer' && <> · {free > 0 ? `${free} מקומות פנויים` : 'מלא'}</>} · {t.cost === 'free' ? 'בלי עלות' : 'השתתפות בדלק'}
              </p>
              {t.note && <p className="text-sm text-muted">{t.note}</p>}
              {mine ? (
                t.requests.length > 0 && (
                  <ul className="space-y-1.5 border-t border-line-soft pt-2">
                    {t.requests.map((r) => (
                      <li key={r.user_id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1">{r.nick}</span>
                        {r.status === 'pending' ? (
                          <>
                            <button type="button" onClick={() => run(() => decideSeatAction({ tripId: t.id, userId: r.user_id, accept: true }))} className="rounded-full bg-ok/20 px-2.5 py-1 text-xs text-ok">
                              אשר
                            </button>
                            <button type="button" onClick={() => run(() => decideSeatAction({ tripId: t.id, userId: r.user_id, accept: false }))} className="rounded-full border border-line px-2.5 py-1 text-xs">
                              דחה
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-muted">{r.status === 'accepted' ? 'אושר ✓' : 'נדחה'}</span>
                        )}
                        <MessageTo userId={r.user_id} />
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <div className="flex items-center gap-2">
                  {myReq ? (
                    <span className="text-xs text-muted">
                      {myReq.status === 'pending' ? 'הבקשה נשלחה' : myReq.status === 'accepted' ? 'אושרת ✓' : 'הבקשה נדחתה'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending || (t.kind === 'offer' && free === 0)}
                      onClick={() => run(() => requestSeatAction({ id: t.id }))}
                      className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {t.kind === 'offer' ? 'בקש מקום' : 'מצטרף'}
                    </button>
                  )}
                  <MessageTo userId={t.user_id} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------- events ----------------
export function EventsBoard({ events, meId }: { events: FanEvent[]; meId: string }) {
  const [form, setForm] = useState(false)
  const [going, setGoing] = useState<Record<string, boolean>>(() => Object.fromEntries(events.map((e) => [e.id, e.going])))
  const { pending, error, run } = useRun()
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(new Date(iso))

  return (
    <div className="space-y-4">
      {form ? (
        <form
          className="space-y-3 rounded-lg border border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const local = String(f.get('when'))
            run(
              () =>
                createEventAction({
                  kind: f.get('kind') as 'screen',
                  title: String(f.get('title')),
                  startsAt: new Date(local).toISOString(),
                  area: String(f.get('area')),
                  note: String(f.get('note')),
                }),
              () => setForm(false),
            )
          }}
        >
          <Field label="סוג">
            <select name="kind" className={input}>
              {Object.entries(EVENT_KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.e} {v.t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="כותרת">
            <input name="title" required minLength={3} maxLength={80} className={input} />
          </Field>
          <Field label="מתי">
            <input name="when" type="datetime-local" required className={input} />
          </Field>
          <Field label="איפה">
            <input name="area" required maxLength={80} placeholder="עיר ומקום" className={input} />
          </Field>
          <Field label="פרטים">
            <input name="note" maxLength={200} placeholder="לא חובה" className={input} />
          </Field>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-accent py-2.5 font-semibold text-white">
              פרסם אירוע
            </button>
            <button type="button" onClick={() => setForm(false)} className="rounded-lg border border-line px-4">
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setForm(true)} className="w-full rounded-lg bg-accent py-3 font-semibold text-white">
          + אירוע חדש
        </button>
      )}
      {error && <p role="alert" className="text-sm text-live">{error}</p>}
      {events.length === 0 && <p className="py-6 text-center text-muted">אין אירועים קרובים.</p>}
      <ul className="space-y-3">
        {events.map((e) => {
          const on = going[e.id] ?? false
          const n = e.going_count + (on && !e.going ? 1 : 0) - (!on && e.going ? 1 : 0)
          return (
            <li key={e.id} className="space-y-1.5 rounded-lg border border-line-soft bg-surface p-3">
              <p className="text-xs text-accent-text">
                {EVENT_KIND[e.kind].e} {EVENT_KIND[e.kind].t} · {fmt(e.starts_at)}
              </p>
              <b className="block font-display text-lg">{e.title}</b>
              <p className="text-sm text-muted">{e.area}</p>
              {e.note && <p className="text-sm">{e.note}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setGoing((g) => ({ ...g, [e.id]: !on }))
                    void goingAction({ id: e.id, on: !on })
                  }}
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold', on ? 'bg-ok/20 text-ok' : 'bg-accent text-white')}
                >
                  {on ? 'מגיע ✓' : 'מגיע?'}
                </button>
                <span className="text-xs text-muted">{n} מגיעים · מארגן: {e.nick}</span>
                {e.user_id === meId ? (
                  <button type="button" aria-label="מחק אירוע" onClick={() => run(() => deleteEventAction({ id: e.id }))} className="ms-auto text-dim">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="ms-auto">
                    <MessageTo userId={e.user_id} label="למארגן" />
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------- market ----------------
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function MarketBoard({ items, meId, teamShort }: { items: MarketItem[]; meId: string; teamShort: string }) {
  const [form, setForm] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const cam = useRef<HTMLInputElement>(null)
  const gal = useRef<HTMLInputElement>(null)
  const { pending, error, run } = useRun()

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-surface p-3 text-sm text-muted">
        🧣 חולצות, צעיפים ומזכרות בין אוהדי {teamShort}. <b>בלי כרטיסים.</b> התשלום ביד, לא דרך האפליקציה.
      </p>
      {form ? (
        <form
          className="space-y-3 rounded-lg border border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(
              async () => {
                let path: string | null = null
                if (file && EXT[file.type]) {
                  path = `${meId}/${crypto.randomUUID()}.${EXT[file.type]}`
                  const up = await createClient().storage.from('market').upload(path, file, { contentType: file.type })
                  if (up.error) return { data: { error: 'העלאת התמונה נכשלה' } }
                }
                return createItemAction({
                  category: f.get('cat') as 'shirt',
                  title: String(f.get('title')),
                  size: String(f.get('size')),
                  condition: f.get('cond') as 'used',
                  price: Number(f.get('price')),
                  path,
                })
              },
              () => {
                setForm(false)
                setFile(null)
              },
            )
          }}
        >
          <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input ref={gal} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="flex gap-2">
            <button type="button" onClick={() => cam.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line py-2 text-sm">
              <Camera className="size-4" aria-hidden="true" />
              צילום
            </button>
            <button type="button" onClick={() => gal.current?.click()} className="flex-1 rounded-md border border-line py-2 text-sm">
              מהגלריה
            </button>
          </div>
          {file && <p className="text-xs text-muted">{file.name}</p>}
          <Field label="מה מוכרים">
            <input name="title" required maxLength={40} placeholder="למשל: חולצת בית 2024" className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="קטגוריה">
              <select name="cat" className={input}>
                {Object.entries(MARKET_CAT).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="מחיר (₪)">
              <input name="price" type="number" min={0} max={100000} required className={input} />
            </Field>
            <Field label="מצב">
              <select name="cond" className={input}>
                {Object.entries(CONDITION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="מידה">
              <input name="size" maxLength={10} placeholder="לא חובה" className={input} />
            </Field>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-accent py-2.5 font-semibold text-white">
              {pending ? 'מפרסם…' : 'פרסם מודעה'}
            </button>
            <button type="button" onClick={() => setForm(false)} className="rounded-lg border border-line px-4">
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setForm(true)} className="w-full rounded-lg bg-accent py-3 font-semibold text-white">
          + מודעה חדשה
        </button>
      )}
      {error && <p role="alert" className="text-sm text-live">{error}</p>}
      {items.length === 0 && <p className="py-6 text-center text-muted">אין מודעות כרגע.</p>}
      <ul className="grid grid-cols-2 gap-3">
        {items.map((i) => {
          const mine = i.user_id === meId
          return (
            <li key={i.id} className={cn('overflow-hidden rounded-lg border border-line-soft bg-surface', i.sold && 'opacity-60')}>
              <div className="relative grid aspect-square place-items-center bg-elev text-3xl">
                {i.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.url} alt={i.title} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span aria-hidden="true">🧣</span>
                )}
                <span className="absolute bottom-1.5 start-1.5 rounded-full bg-canvas/85 px-2 py-0.5 text-sm font-bold">₪{i.price}</span>
                {i.sold && <span className="absolute top-1.5 end-1.5 rounded-full bg-live px-2 py-0.5 text-xs text-white">נמכר</span>}
              </div>
              <div className="space-y-1 p-2">
                <b className="block text-sm">{i.title}</b>
                <p className="text-xs text-muted">
                  {CONDITION[i.condition]}
                  {i.size && ` · מידה ${i.size}`} · {i.nick}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {mine ? (
                    <>
                      {!i.sold && (
                        <button type="button" onClick={() => run(() => markSoldAction({ id: i.id }))} className="rounded-full border border-line px-2 py-0.5 text-xs">
                          נמכר
                        </button>
                      )}
                      <button type="button" onClick={() => run(() => deleteItemAction({ id: i.id }))} className="text-xs text-dim">
                        מחיקה
                      </button>
                    </>
                  ) : (
                    !i.sold && <MessageTo userId={i.user_id} label="למוכר" />
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
