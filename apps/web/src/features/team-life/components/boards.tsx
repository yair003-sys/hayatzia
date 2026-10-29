'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, MessageSquare, ShieldCheck, Shirt, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { openThreadAction } from '@/features/dm/server/actions'
import { ReportBlock } from '@/features/safety/components/report-block'
import { CONDITION, departureLabel, EVENT_KIND, MARKET_CAT, MARKET_DISCLAIMER, RIDE_DISCLAIMER, TRIP_KIND } from '../schema'
import type { FanEvent, MarketItem, RideProfile, RideToRate, Trip } from '../server/queries'
import {
  PICKUP_LABEL,
  PICKUP_SUGGESTIONS,
  PICKUP_WARNING,
  RIDE_SUSPENDED_HE,
  WOMEN_DRIVERS_FILTER,
  WOMEN_ONLY_LABEL,
  emergencyOpen,
  filterRides,
  trustLine,
} from '../ride-safety'
import { ROLLOUT_BANNER, VERIFIED_BADGE, formatPlate } from '@/features/verification/schema'
import { EmergencyButton } from './emergency-button'
import { RateRides, SafetyGate, ShareRide } from './ride-safety'
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
type T = ReturnType<typeof useTranslations>
const errorOf = (r: Result, t: T) => r.data?.error ?? r.serverError ?? (r.validationErrors ? t('checkDetails') : null)

function useRun() {
  const t = useTranslations('teamLife')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn()
      const e = errorOf(r, t)
      setError(e)
      if (!e) {
        after?.()
        router.refresh()
      }
    })
  return { pending, error, run }
}

function MessageTo({ userId, label }: { userId: string; label?: string }) {
  const t = useTranslations('teamLife')
  const [pending, start] = useTransition()
  const text = label ?? t('message')
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await openThreadAction({ otherId: userId })))}
      className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs"
    >
      <MessageSquare className="size-3.5" aria-hidden="true" />
      {text}
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

type TripsProps = {
  matches: MatchOption[]
  trips: Trip[]
  meId: string
  focusId?: string
  /** The fan's own ride state (null when it could not be read: the database still enforces every rule). */
  ride: RideProfile | null
  toRate: RideToRate[]
  /** The fan's own verification (2026-10-16); null when it could not be read (the database still decides). */
  verify: { required: boolean; identity: boolean; driver: boolean } | null
}

/** "מאומת" next to a verified fan in rides. */
function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      {VERIFIED_BADGE}
    </span>
  )
}

export function TripsBoard({ matches, trips, meId, focusId, ride, toRate, verify }: TripsProps) {
  const t = useTranslations('teamLife')
  // A trip opened from a notification: its match is picked and the trip scrolled into view.
  const focused = focusId ? trips.find((t) => t.id === focusId) : undefined
  const [fixtureId, setFixtureId] = useState(matches.find((m) => m.id === focused?.fixture_id)?.id ?? matches[0]?.id)
  const focusedId = focused?.id
  useEffect(() => {
    if (focusedId) document.getElementById(`trip-${focusedId}`)?.scrollIntoView({ block: 'center' })
  }, [focusedId])
  const [form, setForm] = useState(false)
  const [womenDrivers, setWomenDrivers] = useState(false)
  const [pickup, setPickup] = useState('')
  // The one-time 18+ confirmation and safety screen stands before the first offer or request (rules 2 and 8).
  const [gate, setGate] = useState<null | (() => void)>(null)
  const [confirmed, setConfirmed] = useState(false)
  const ready = confirmed || (!!ride?.adultConfirmed && !!ride?.safetySeen)
  const guarded = (fn: () => void) => (ready ? fn() : setGate(() => fn))
  const { pending, error, run } = useRun()
  const match = matches.find((m) => m.id === fixtureId)
  const drivers = Object.fromEntries(trips.map((t) => [t.user_id, t.driver ?? undefined]))
  const list = filterRides(
    trips.filter((t) => t.fixture_id === fixtureId),
    womenDrivers,
    drivers,
  )
  const suspended = !!ride?.suspended
  const isWoman = ride?.gender === 'f'

  return (
    <div className="space-y-4">
      <RateRides rides={toRate} />
      {!match ? (
        <p className="py-8 text-center text-muted">{t('noUpcomingMatches')}</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={m.id === fixtureId}
                onClick={() => setFixtureId(m.id)}
                className={cn('min-h-11 shrink-0 rounded-full border px-3 text-sm', m.id === fixtureId ? 'border-accent bg-accent-soft' : 'border-line text-muted')}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={womenDrivers}
              onClick={() => setWomenDrivers(!womenDrivers)}
              className={cn('min-h-11 rounded-full border px-3 text-sm', womenDrivers ? 'border-accent bg-accent-soft font-semibold' : 'border-line text-muted')}
            >
              {WOMEN_DRIVERS_FILTER}
            </button>
          </div>

          {suspended && (
            <p role="status" className="rounded-lg border border-live/40 bg-surface p-3 text-sm">
              {RIDE_SUSPENDED_HE}
            </p>
          )}
          {verify?.required && !verify.identity && (
            <div role="status" className="space-y-2 rounded-lg border border-accent bg-surface p-3 text-sm">
              <p>{ROLLOUT_BANNER}</p>
              <Link href="/me/verify" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-semibold text-white">
                {t('toVerify')}
              </Link>
            </div>
          )}
          {verify?.required && verify.identity && !verify.driver && (
            <p className="text-xs text-muted">
              {t('needLicense')}{' '}
              <Link href="/me/verify" className="underline">
                {t('toVerify')}
              </Link>
            </p>
          )}

          {gate ? (
            <SafetyGate
              age={ride?.age ?? 'adult'}
              onDone={() => {
                setConfirmed(true)
                const next = gate
                setGate(null)
                next()
              }}
              onCancel={() => setGate(null)}
            />
          ) : form ? (
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
                      pickup,
                      womenOnly: isWoman && f.get('womenOnly') === 'on',
                      departBeforeMin: Number(f.get('before')),
                      seats: Number(f.get('seats')),
                      cost: f.get('cost') as 'share',
                      note: String(f.get('note')),
                    }),
                  () => {
                    setForm(false)
                    setPickup('')
                  },
                )
              }}
            >
              <p className="rounded-md bg-elev p-2.5 text-xs leading-relaxed text-muted">{RIDE_DISCLAIMER}</p>
              <Field label={t('kindLabel')}>
                <select name="kind" className={input}>
                  {Object.entries(TRIP_KIND).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('leavingFrom')}>
                <input name="from" required maxLength={40} placeholder={t('fromPlaceholder')} className={input} />
              </Field>
              <div className="space-y-1.5">
                <label className="block space-y-1 text-sm">
                  <span className="text-muted">{PICKUP_LABEL}</span>
                  <input
                    name="pickup"
                    required
                    minLength={3}
                    maxLength={80}
                    value={pickup}
                    onChange={(e) => setPickup(e.target.value)}
                    list="pickup-suggestions"
                    placeholder={t('pickupPlaceholder')}
                    aria-describedby="pickup-warning"
                    className={input}
                  />
                </label>
                <datalist id="pickup-suggestions">
                  {PICKUP_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-2" aria-label={t('pickupSuggestionsAria')}>
                  {PICKUP_SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => setPickup(s)} className="min-h-11 rounded-full border border-line px-3 text-xs">
                      {s}
                    </button>
                  ))}
                </div>
                <p id="pickup-warning" className="text-xs font-medium text-warn">
                  {PICKUP_WARNING}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('howLongBefore')}>
                  <select name="before" defaultValue="120" className={input}>
                    {[60, 90, 120, 150, 180, 240].map((m) => (
                      <option key={m} value={m}>
                        {m / 60} {t('hoursShort')} ({departureLabel(match.kickoff, m)})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('freeSeatsLabel')}>
                  <input name="seats" type="number" min={0} max={8} defaultValue={3} className={input} />
                </Field>
              </div>
              <Field label={t('costLabel')}>
                <select name="cost" className={input}>
                  <option value="share">{t('costShare')}</option>
                  <option value="free">{t('costFree')}</option>
                </select>
              </Field>
              {isWoman && (
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="womenOnly" className="size-5" />
                  {WOMEN_ONLY_LABEL}
                </label>
              )}
              <Field label={t('noteLabel')}>
                <input name="note" maxLength={140} placeholder={t('optional')} className={input} />
              </Field>
              <div className="flex gap-2">
                <button type="submit" disabled={pending} className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-white">
                  {t('publish')}
                </button>
                <button type="button" onClick={() => setForm(false)} className="min-h-11 rounded-lg border border-line px-4">
                  {t('cancel')}
                </button>
              </div>
            </form>
          ) : (
            !suspended && (
              <button
                type="button"
                onClick={() => guarded(() => setForm(true))}
                className="min-h-11 w-full rounded-lg bg-accent py-3 font-semibold text-white"
              >
                {t('newRide')}
              </button>
            )
          )}
          {error && (
            <p role="alert" className="text-sm text-live">
              {error}
            </p>
          )}

          {list.length === 0 && (
            <p className="py-6 text-center text-muted">{womenDrivers ? t('noWomenRides') : t('noRides')}</p>
          )}
          <ul className="space-y-3">
            {list.map((tr) => {
              const mine = tr.user_id === meId
              const myReq = tr.requests.find((r) => r.user_id === meId)
              const accepted = tr.requests.filter((r) => r.status === 'accepted').length
              const free = Math.max(tr.seats - accepted, 0)
              const closedToMe = tr.women_only && !isWoman
              const verifiedAuthor = tr.trust ? (tr.kind === 'offer' ? tr.trust.driver : tr.trust.identity) : false
              const inRide = tr.kind !== 'meet' && (myReq?.status === 'accepted' || (mine && tr.requests.some((r) => r.status === 'accepted')))
              return (
                <li key={tr.id} id={`trip-${tr.id}`} className={cn('space-y-2 rounded-lg border border-line-soft bg-surface p-3', tr.id === focusedId && 'trip-focus')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{tr.nick}</b>
                    {verifiedAuthor && <VerifiedBadge />}
                    <span className="text-xs text-accent-text">{TRIP_KIND[tr.kind]}</span>
                    {tr.women_only && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">{WOMEN_ONLY_LABEL}</span>}
                    {mine && (
                      <button type="button" aria-label={t('deleteRide')} onClick={() => run(() => deleteTripAction({ id: tr.id }))} className="ms-auto flex size-11 items-center justify-center text-dim">
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {tr.kind === 'offer' && tr.driver && <p className="text-xs text-muted">{trustLine(tr.driver)}</p>}
                  {tr.kind === 'offer' && tr.trust?.car && <p className="text-sm">{t('carLabel')} {tr.trust.car}</p>}
                  {tr.plate && (
                    <p className="text-sm">
                      {t('plateLabel')}{' '}
                      <b dir="ltr" className="t-num">
                        {formatPlate(tr.plate)}
                      </b>
                    </p>
                  )}
                  <p className="text-sm">
                    {t('from', { city: tr.from_city })} · {t('departure')} {departureLabel(match.kickoff, tr.depart_before_min)}
                    {tr.kind === 'offer' && <> · {free > 0 ? t('freeSeats', { count: free }) : t('full')}</>} · {tr.cost === 'free' ? t('costFree') : t('costShare')}
                  </p>
                  {tr.pickup && <p className="text-sm">{t('pickupShort')} {tr.pickup}</p>}
                  {tr.note && <p className="text-sm text-muted">{tr.note}</p>}
                  {mine ? (
                    tr.requests.length > 0 && (
                      <ul className="space-y-2 border-t border-line-soft pt-2">
                        {tr.requests.map((r) => (
                          <li key={r.user_id} className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="flex flex-1 items-center gap-1.5">
                                {r.nick}
                                {r.verified && <VerifiedBadge />}
                              </span>
                              {r.status === 'pending' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => run(() => decideSeatAction({ tripId: tr.id, userId: r.user_id, accept: true }))}
                                    className="min-h-11 rounded-full bg-ok/20 px-3 text-xs text-ok"
                                  >
                                    {t('approve')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => run(() => decideSeatAction({ tripId: tr.id, userId: r.user_id, accept: false }))}
                                    className="min-h-11 rounded-full border border-line px-3 text-xs"
                                  >
                                    {t('reject')}
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-muted">{r.status === 'accepted' ? t('accepted') : t('rejected')}</span>
                              )}
                              <MessageTo userId={r.user_id} />
                            </div>
                            <ReportBlock kind="user" refId={r.user_id} userId={r.user_id} userNick={r.nick} />
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {myReq ? (
                        <span className="text-xs text-muted">
                          {myReq.status === 'pending' ? t('requestSent') : myReq.status === 'accepted' ? t('youAccepted') : t('requestRejected')}
                        </span>
                      ) : closedToMe ? (
                        <span className="text-xs text-muted">{WOMEN_ONLY_LABEL}</span>
                      ) : (
                        !suspended && (
                          <button
                            type="button"
                            disabled={pending || (tr.kind === 'offer' && free === 0)}
                            onClick={() => guarded(() => run(() => requestSeatAction({ id: tr.id })))}
                            className="min-h-11 rounded-full bg-accent px-3 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            {tr.kind === 'offer' ? t('requestSeat') : t('joining')}
                          </button>
                        )
                      )}
                      <MessageTo userId={tr.user_id} />
                    </div>
                  )}
                  {tr.kind === 'offer' && (mine || myReq?.status === 'accepted') && (
                    <div className="flex flex-wrap items-center gap-2">
                      <ShareRide
                        tripId={tr.id}
                        driverNick={tr.nick}
                        pickup={tr.pickup}
                        fromCity={tr.from_city}
                        kickoffSec={match.kickoff}
                        departBeforeMin={tr.depart_before_min}
                        match={match.label}
                        car={tr.trust?.car ?? null}
                        verified={tr.trust?.driver ?? false}
                      />
                    </div>
                  )}
                  {inRide && emergencyOpen(match.kickoff, tr.depart_before_min) && <EmergencyButton tripId={tr.id} />}
                  {!mine && <ReportBlock kind="trip" refId={tr.id} userId={tr.user_id} userNick={tr.nick} />}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

// ---------------- events ----------------
export function EventsBoard({ events, meId }: { events: FanEvent[]; meId: string }) {
  const t = useTranslations('teamLife')
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
          <Field label={t('kindLabel')}>
            <select name="kind" className={input}>
              {Object.entries(EVENT_KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.e} {v.t}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('titleLabel')}>
            <input name="title" required minLength={3} maxLength={80} className={input} />
          </Field>
          <Field label={t('whenLabel')}>
            <input name="when" type="datetime-local" required className={input} />
          </Field>
          <Field label={t('whereLabel')}>
            <input name="area" required maxLength={80} placeholder={t('cityPlace')} className={input} />
          </Field>
          <Field label={t('detailsLabel')}>
            <input name="note" maxLength={200} placeholder={t('optional')} className={input} />
          </Field>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-accent py-2.5 font-semibold text-white">
              {t('publishEvent')}
            </button>
            <button type="button" onClick={() => setForm(false)} className="rounded-lg border border-line px-4">
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setForm(true)} className="w-full rounded-lg bg-accent py-3 font-semibold text-white">
          {t('newEvent')}
        </button>
      )}
      {error && <p role="alert" className="text-sm text-live">{error}</p>}
      {events.length === 0 && <p className="py-6 text-center text-muted">{t('noEvents')}</p>}
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
                  {on ? t('going') : t('goingQ')}
                </button>
                <span className="text-xs text-muted">{t('goingCount', { count: n })} · {t('organizer', { nick: e.nick })}</span>
                {e.user_id === meId ? (
                  <button type="button" aria-label={t('deleteEvent')} onClick={() => run(() => deleteEventAction({ id: e.id }))} className="ms-auto text-dim">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="ms-auto">
                    <MessageTo userId={e.user_id} label={t('toOrganizer')} />
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
  const t = useTranslations('teamLife')
  const [form, setForm] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const cam = useRef<HTMLInputElement>(null)
  const gal = useRef<HTMLInputElement>(null)
  const { pending, error, run } = useRun()

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-surface p-3 text-sm text-muted">
        {t.rich('marketIntro', { team: teamShort, b: (c) => <b>{c}</b> })}
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
                  if (up.error) return { data: { error: t('imageUploadFailed') } }
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
          <p className="rounded-md bg-elev p-2.5 text-xs leading-relaxed text-muted">{MARKET_DISCLAIMER}</p>
          <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input ref={gal} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="flex gap-2">
            <button type="button" onClick={() => cam.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line py-2 text-sm">
              <Camera className="size-4" aria-hidden="true" />
              {t('photo')}
            </button>
            <button type="button" onClick={() => gal.current?.click()} className="flex-1 rounded-md border border-line py-2 text-sm">
              {t('fromGallery')}
            </button>
          </div>
          {file && <p className="text-xs text-muted">{file.name}</p>}
          <Field label={t('whatSelling')}>
            <input name="title" required maxLength={40} placeholder={t('sellingPlaceholder')} className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('categoryLabel')}>
              <select name="cat" className={input}>
                {Object.entries(MARKET_CAT).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('priceLabel')}>
              <input name="price" type="number" min={0} max={100000} required className={input} />
            </Field>
            <Field label={t('conditionLabel')}>
              <select name="cond" className={input}>
                {Object.entries(CONDITION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('sizeLabel')}>
              <input name="size" maxLength={10} placeholder={t('optional')} className={input} />
            </Field>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-accent py-2.5 font-semibold text-white">
              {pending ? t('publishing') : t('publishItem')}
            </button>
            <button type="button" onClick={() => setForm(false)} className="rounded-lg border border-line px-4">
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setForm(true)} className="w-full rounded-lg bg-accent py-3 font-semibold text-white">
          {t('newItem')}
        </button>
      )}
      {error && <p role="alert" className="text-sm text-live">{error}</p>}
      {items.length === 0 && <p className="py-6 text-center text-muted">{t('noItems')}</p>}
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
                  <Shirt className="size-8 text-dim" strokeWidth={1.5} aria-hidden="true" />
                )}
                <span className="absolute bottom-1.5 start-1.5 rounded-full bg-canvas/85 px-2 py-0.5 text-sm font-bold">₪{i.price}</span>
                {i.sold && <span className="absolute top-1.5 end-1.5 rounded-full bg-live px-2 py-0.5 text-xs text-white">{t('sold')}</span>}
              </div>
              <div className="space-y-1 p-2">
                <b className="block text-sm">{i.title}</b>
                <p className="text-xs text-muted">
                  {CONDITION[i.condition]}
                  {i.size && ` · ${t('sizeIs', { size: i.size })}`} · {i.nick}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {mine ? (
                    <>
                      {!i.sold && (
                        <button type="button" onClick={() => run(() => markSoldAction({ id: i.id }))} className="rounded-full border border-line px-2 py-0.5 text-xs">
                          {t('markSold')}
                        </button>
                      )}
                      <button type="button" onClick={() => run(() => deleteItemAction({ id: i.id }))} className="text-xs text-dim">
                        {t('deleteItem')}
                      </button>
                    </>
                  ) : (
                    !i.sold && <MessageTo userId={i.user_id} label={t('toSeller')} />
                  )}
                </div>
                {!mine && <ReportBlock kind="market_item" refId={i.id} userId={i.user_id} userNick={i.nick} />}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
