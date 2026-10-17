// LOAD TEST ONLY: does the screen show exactly what the database holds, while 50k seeded fans load the app and after?
// Runs at phone size (375 px) as the reserved seeded fans 1..20 (k6 never acts as them), against the LOCAL build on
// the LOCAL Supabase of the CI runner. The "database truth" is read through PostgREST with the same fan's token, so
// it is exactly what RLS lets that fan see. Under load the data keeps moving, so a number read on screen must lie
// between the database value just before and just after the screen was read. Each check appends one JSON line to
// $OUT_DIR/consistency-$PHASE.jsonl (the job summary is built from it).
import { appendFileSync, readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

type Fan = { i: number; id: string; team: string; fixture: number | null; token: string; cookies: { name: string; value: string }[] }
type Fans = { live: { id: number; home: string; away: string }; fans: Fan[] }

const PHASE = process.env.PHASE ?? 'after'
const OUT = `${process.env.OUT_DIR ?? '.'}/consistency-${PHASE}.jsonl`
const BASE = process.env.SUPABASE_URL ?? ''
const KEY = process.env.SUPABASE_KEY ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw new Error(`refusing: SUPABASE_URL must be the local stack, got ${BASE}`)
const data = JSON.parse(readFileSync(process.env.FANS_FILE ?? 'fans.json', 'utf8')) as Fans
const fan = (i: number): Fan => {
  const f = data.fans.find((x) => x.i === i)
  if (!f) throw new Error(`reserved fan ${i} missing from the sample`)
  return f
}

function record(check: string, pass: boolean, detail: string, values: Record<string, unknown> = {}) {
  appendFileSync(OUT, JSON.stringify({ phase: PHASE, check, pass, detail, values, at: new Date().toISOString() }) + '\n')
}

/** The checker's own reads of the database truth: retried on a busy pool (504), since the checker is not under test. */
async function rest<T>(f: Fan, path: string, init: RequestInit = {}): Promise<T> {
  let last = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { apikey: KEY, Authorization: `Bearer ${f.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
    if (res.ok) return (await res.json()) as T
    last = `${path.split('?')[0]} → ${res.status} ${(await res.text()).slice(0, 120)}`
    if (res.status !== 504 && res.status !== 503) break
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(last)
}

/** Runs a check; if the check itself cannot run (timeout, the database truth unreadable), says so in the results. */
async function checked(name: string, body: () => Promise<void>) {
  try {
    await body()
  } catch (e) {
    const msg = e instanceof Error ? e.message.split('\n')[0] ?? '' : String(e)
    if (!/^expect/.test(msg) && !msg.includes('toBeTruthy')) record(name, false, `could not verify: ${msg.slice(0, 160)}`, { unverified: true })
    throw e
  }
}

async function signIn(page: Page, f: Fan) {
  await page.context().addCookies(f.cookies.map((c) => ({ name: c.name, value: c.value, domain: '127.0.0.1', path: '/', sameSite: 'Lax' as const })))
}

/** The red "באג פריסה" bar (OverflowGuard, test builds) and the page's own width, as the owner's rule asks. */
async function layout(page: Page) {
  await page.waitForTimeout(1200) // the guard measures after paint
  const bar = await page.getByRole('alert').filter({ hasText: 'באג פריסה' }).count()
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  return { bar, ...w, ok: bar === 0 && w.sw === w.cw }
}

/**
 * Waits for the screen's data or for its "לא הצלחנו לטעון" state (finding 6 of 2026-10-17: a failed read says so
 * instead of showing a 0 or an empty list). An honest error is not wrong data: the check records it and passes.
 */
const LOAD_ERROR = 'לא הצלחנו לטעון'
async function dataOrError(page: Page, data: Locator, timeout = 30_000): Promise<'data' | 'error'> {
  const err = page.getByRole('alert').filter({ hasText: LOAD_ERROR })
  await data.or(err).first().waitFor({ timeout })
  return (await err.count()) > 0 && (await data.count()) === 0 ? 'error' : 'data'
}

const shortCount = (n: number) => (n < 1000 ? String(n) : n < 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : `${Math.floor(n / 1000)}K`)
const between = (x: number, a: number, b: number) => x >= Math.min(a, b) && x <= Math.max(a, b)


const PAGES: [string, () => string][] = [
  ['home', () => '/stand'],
  ['team chat', () => '/stand/chat'],
  ['live match room', () => `/matches/${data.live.id}`],
  ['Square', () => '/square'],
  ['inbox', () => '/inbox'],
  ['my card', () => '/me'],
  ['trips', () => '/stand/trips'],
  ['activity', () => '/activity'],
]
for (const [label, path] of PAGES) {
  test(`layout at 375px: ${label}`, async ({ page }) => {
    await signIn(page, fan(1))
    const t0 = Date.now()
    await page.goto(path(), { waitUntil: 'load' })
    const loadMs = Date.now() - t0
    const signedIn = !/\/(login|onboarding)/.test(new URL(page.url()).pathname)
    const l = await layout(page)
    const pass = signedIn && l.ok
    record(`layout ${label}`, pass, signedIn ? `bar ${l.bar}, scrollWidth ${l.sw} / clientWidth ${l.cw}` : `redirected to ${page.url()}`, {
      loadMs,
      ...l,
    })
    if (!pass) await page.screenshot({ path: `${process.env.OUT_DIR ?? '.'}/shot-${PHASE}-${label.replace(/\W+/g, '_')}.png`, fullPage: true })
    expect(pass, `layout ${label}`).toBeTruthy()
  })
}

type Msg = { id: string; created_at: string }

test('team chat shows the newest messages of the database, in order, with no gap (realtime included)', async ({ page }) => {
  await checked('team chat = database (contiguous, ordered)', async () => {
    const me = fan(1)
    await signIn(page, me)
    await page.goto('/stand/chat', { waitUntil: 'load' })
    if ((await dataOrError(page, page.locator('li[data-mid]'))) === 'error') {
      record('team chat = database (contiguous, ordered)', true, 'the screen says it could not load (no wrong data shown)', { loadError: true })
      return
    }
    await page.waitForTimeout(5000) // messages that arrive meanwhile come over realtime
    const readAt = Date.now()
    const ui = await page.locator('li[data-mid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-mid') ?? ''))
    const db = (await rest<Msg[]>(me, '/rest/v1/team_messages?select=id,created_at&order=created_at.desc,id.desc&limit=400')).reverse()
    const pos = new Map(db.map((m, k) => [m.id, k]))
    const phantom = ui.filter((id) => !pos.has(id))
    const first = ui.find((id) => pos.has(id))
    const from = first === undefined ? -1 : (pos.get(first) ?? -1)
    // Every database message from the oldest one on screen until 3 s before reading must be on screen.
    const expected = from < 0 ? [] : db.slice(from).filter((m) => Date.parse(m.created_at) <= readAt - 3000)
    const shown = new Set(ui)
    const missing = expected.filter((m) => !shown.has(m.id)).map((m) => m.id)
    const order = ui.filter((id) => pos.has(id)).every((id, k, a) => k === 0 || (pos.get(a[k - 1] as string) ?? 0) < (pos.get(id) ?? 0))
    const pass = from >= 0 && phantom.length === 0 && missing.length === 0 && order
    record('team chat = database (contiguous, ordered)', pass, `${ui.length} on screen, ${expected.length} expected, ${missing.length} missing, ${phantom.length} not in DB, order ${order}`, {
      onScreen: ui.length,
      expected: expected.length,
      missing: missing.length,
      phantom: phantom.length,
      ordered: order,
    })
    expect(pass).toBeTruthy()
  })
})

test('a message sent by another fan reaches an open chat over realtime within 5 s', async ({ page }) => {
  await checked('realtime: sent message appears in another fan’s open chat ≤ 5 s', async () => {
    const reader = fan(1)
    const writer = fan(2)
    await signIn(page, reader)
    await page.goto('/stand/chat', { waitUntil: 'load' })
    await page.locator('li[data-mid]').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(2000) // channel joined
    const lags: number[] = []
    const sendMs: number[] = []
    for (let k = 0; k < 3; k++) {
      const t0 = Date.now()
      const [row] = await rest<{ id: string }[]>(writer, '/rest/v1/team_messages?select=id', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ body: `[נתוני עומס] בדיקת סנכרון ${PHASE} ${k} t=${t0}` }),
      })
      if (!row) throw new Error('insert returned no row')
      // From the moment the database confirmed the message until it shows in the other fan's open chat.
      const t1 = Date.now()
      sendMs.push(t1 - t0)
      let lag = -1
      try {
        await page.locator(`li[data-mid="${row.id}"]`).waitFor({ timeout: 5000 })
        lag = Date.now() - t1
      } catch {
        lag = -1
      }
      lags.push(lag)
      await page.waitForTimeout(2500) // under the 5-per-10-s limit
    }
    const pass = lags.every((l) => l >= 0 && l <= 5000)
    record(
      'realtime: sent message appears in another fan’s open chat ≤ 5 s',
      pass,
      `database → other screen ms: ${lags.map((l) => (l < 0 ? 'missed' : l)).join(', ')} (the send itself took ${sendMs.join(', ')} ms)`,
      { lags, sendMs },
    )
    expect(pass).toBeTruthy()
  })
})

type Clip = { id: string; nick: string; likes_count: number; user_id: string }

test('Square: the like count on the first post equals the database', async ({ page }) => {
  await checked('Square like count = database', async () => {
    const me = fan(1)
    await signIn(page, me)
    const q = '/rest/v1/clips?select=id,nick,likes_count,user_id&audience=eq.all&order=created_at.desc,id.desc&limit=20'
    const before = await rest<Clip[]>(me, q)
    await page.goto('/square', { waitUntil: 'load' })
    const card = page.locator('article[aria-label^="פוסט של"]').first()
    if ((await dataOrError(page, card)) === 'error') {
      record('Square like count = database', true, 'the screen says it could not load (no wrong data shown)', { loadError: true })
      return
    }
    const label = (await card.getAttribute('aria-label')) ?? ''
    const likeText = ((await card.locator('button[aria-pressed]').first().innerText()) ?? '').replace('לייק', '').trim()
    const after = await rest<Clip[]>(me, q)
    const nick = label.replace('פוסט של ', '')
    const b = before.find((c) => c.nick === nick)
    const a = after.find((c) => c.nick === nick && (!b || c.id === b.id))
    let pass = false
    let detail = `post of ${nick}: screen "${likeText}"`
    if (a && b) {
      const ok = [b.likes_count, a.likes_count].some((n) => shortCount(n) === likeText) || (/^\d+$/.test(likeText) && between(Number(likeText), b.likes_count, a.likes_count))
      pass = ok
      detail += `, database ${b.likes_count} before / ${a.likes_count} after`
    } else detail += ', post not found in the database feed'
    record('Square like count = database', pass, detail, { screen: likeText, before: b?.likes_count, after: a?.likes_count })
    expect(pass).toBeTruthy()
  })
})

test('crowd war bar shows the database totals of the match', async ({ page }) => {
  await checked('crowd war totals = database', async () => {
    const me = fan(15) // bei: the war of tomorrow's match is open
    if (!me.fixture) throw new Error('fan 15 has no match in the current round')
    await signIn(page, me)
    const q = `/rest/v1/crowd_war_totals?select=team_id,points&fixture_id=eq.${me.fixture}`
    const before = await rest<{ team_id: string; points: number }[]>(me, q)
    await page.goto(`/matches/${me.fixture}`, { waitUntil: 'load' })
    const bar = page.locator('.cw-bar').first()
    await bar.waitFor({ timeout: 30_000 })
    const label = (await bar.getAttribute('aria-label')) ?? ''
    const after = await rest<{ team_id: string; points: number }[]>(me, q)
    const shown = [...label.matchAll(/\((\d+) נקודות\)/g)].map((m) => Number(m[1]))
    // Same order for both reads (the rows come in no particular order): by club id.
    const pts = (rows: { team_id: string; points: number }[]) => [...rows].sort((a, b) => a.team_id.localeCompare(b.team_id)).map((r) => r.points)
    const bs = pts(before)
    const as = pts(after)
    // The screen gives home then away; the rows have club ids: either pairing within the before/after range passes.
    const fits = (x: number[], y: number[]) => x.length === 2 && y.length === 2 && between(shown[0] ?? -1, x[0] ?? 0, y[0] ?? 0) && between(shown[1] ?? -1, x[1] ?? 0, y[1] ?? 0)
    const pass = shown.length === 2 && (fits(bs, as) || fits([...bs].reverse(), [...as].reverse()))
    record('crowd war totals = database', pass, `screen ${shown.join(' / ')}, database before ${bs.join(' / ')} after ${as.join(' / ')}`, { shown, before: bs, after: as })
    expect(pass).toBeTruthy()
  })
})

test('activity bell count equals the database unread count', async ({ page }) => {
  await checked('bell unread = database', async () => {
    const me = fan(3)
    await signIn(page, me)
    const count = () => rest<number>(me, '/rest/v1/rpc/activity_unread_count', { method: 'POST', body: '{}' })
    const before = await count()
    await page.goto('/me', { waitUntil: 'load' })
    const bell = page.locator('a.bell').first()
    await bell.waitFor({ timeout: 30_000 })
    const label = (await bell.getAttribute('aria-label')) ?? ''
    const after = await count()
    if (label.includes(LOAD_ERROR)) {
      record('bell unread = database', true, `screen "${label}" (says it could not load, no made-up 0), database ${before} before / ${after} after`, { loadError: true, before, after })
      return
    }
    const m = /התראות, (\d+\+?) חדשות/.exec(label)
    const screen = m ? m[1] : '0'
    const cap = (n: number) => (n >= 100 ? '99+' : String(n))
    const pass = screen === cap(before) || screen === cap(after) || (/^\d+$/.test(screen ?? '') && between(Number(screen), before, after))
    record('bell unread = database', pass, `screen "${label}", database ${before} before / ${after} after`, { screen, before, after })
    expect(pass).toBeTruthy()
  })
})

type Thread = { id: string; user_a: string; user_b: string; unread_a: number; unread_b: number; accepted_at: string | null; opened_by: string | null; last_message_id: string | null }
type Member = { role: string; unread: number; dm_groups: { id: string } | null }

test('inbox: chats, message requests and unread badges equal the database', async ({ page }) => {
  await checked('inbox = database', async () => {
    const me = fan(4)
    await signIn(page, me)
    const threads = await rest<Thread[]>(me, '/rest/v1/dm_threads?select=id,user_a,user_b,unread_a,unread_b,accepted_at,opened_by,last_message_id&order=last_at.desc&limit=100')
    const members = await rest<Member[]>(me, `/rest/v1/dm_group_members?select=role,unread,dm_groups(id)&user_id=eq.${me.id}&limit=100`)
    const blocked = new Set((await rest<{ blocked_id: string }[]>(me, '/rest/v1/blocks?select=blocked_id')).map((b) => b.blocked_id))
    // The inbox's own rules (features/dm/server/queries.ts + schema.ts), applied to the database rows.
    const rows = threads
      .map((t) => {
        const mineA = t.user_a === me.id
        const request = t.accepted_at || !t.opened_by ? null : t.opened_by === me.id ? 'outgoing' : 'incoming'
        return { other: mineA ? t.user_b : t.user_a, unread: mineA ? t.unread_a : t.unread_b, request, last: t.last_message_id }
      })
      .filter((t) => !blocked.has(t.other) && !(t.request === 'incoming' && !t.last))
    const requests = rows.filter((r) => r.request === 'incoming').length
    const groups = members.filter((m) => m.role !== 'invited' && m.dm_groups)
    const chats = rows.filter((r) => r.request !== 'incoming').length + groups.length
    const badges = rows.filter((r) => r.request !== 'incoming' && r.unread > 0).length + groups.filter((g) => g.unread > 0).length

    await page.goto('/inbox', { waitUntil: 'load' })
    const list = page.locator('ul[aria-label="שיחות"] > li')
    if ((await dataOrError(page, list)) === 'error') {
      record('inbox = database', true, 'the screen says it could not load (no partial list shown)', { loadError: true, chats, badges, requests })
      return
    }
    const shownChats = await list.count()
    const shownBadges = await page.locator('ul[aria-label="שיחות"] .ib-badge').count()
    const reqText = (await page.getByText(/^בקשות \(\d+\)$/).first().textContent({ timeout: 2000 }).catch(() => null)) ?? 'בקשות (0)'
    const shownRequests = Number(/\((\d+)\)/.exec(reqText)?.[1] ?? 0)
    const pass = shownChats === chats && shownBadges === badges && shownRequests === requests
    record('inbox = database', pass, `chats ${shownChats}/${chats}, unread badges ${shownBadges}/${badges}, requests ${shownRequests}/${requests} (screen/database)`, {
      shownChats,
      chats,
      shownBadges,
      badges,
      shownRequests,
      requests,
    })
    expect(pass).toBeTruthy()
  })
})
