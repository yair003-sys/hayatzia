// LOAD TEST ONLY (k6). Seeded fake fans use the app the way the real one does, against the LOCAL Supabase and the
// LOCAL Next.js build inside the CI runner (.github/workflows/web-load-local.yml). Refuses any other target.
//
// Scenarios (all at once):
//   api      PostgREST / RPC / Storage calls copied from apps/web/src/features/** (same selects, filters, orders, RPCs):
//            home, team chat read + send, match room read + send (live match), Square keyset pages + like + comment,
//            inbox + thread + ciphertext send, ratings, activity bell, predictions, crowd war.
//   goal     a "goal" burst in the live match room (many fans of the two clubs writing "גול" at once).
//   pages    the real Next.js pages as signed-in fans (server rendering + cache + database together).
//   realtime websocket sessions as the app opens them: online:<club> (presence), team:<club>, inbox:<me>, and the
//            live match:<id> + room:<id> for fans of the two clubs. Measures join time, delivery time of chat
//            broadcasts (the send time rides in the message text), and how many sessions stay connected.
// Thresholds are informative only (the workflow never fails on them); every number lands in summary.md / .json.
import http from 'k6/http'
import ws from 'k6/ws'
import exec from 'k6/execution'
import { check, sleep } from 'k6'
import { SharedArray } from 'k6/data'
import { Counter, Trend } from 'k6/metrics'

const BASE = __ENV.SUPABASE_URL
const KEY = __ENV.SUPABASE_KEY
const APP = __ENV.APP_URL || ''
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/
if (!BASE || !KEY) throw new Error('SUPABASE_URL and SUPABASE_KEY are required')
if (!LOCAL.test(BASE)) throw new Error(`refusing: SUPABASE_URL must be the local stack, got ${BASE}`)
if (APP && !LOCAL.test(APP)) throw new Error(`refusing: APP_URL must be the local build, got ${APP}`)
// Direct mode: the local single-worker Kong of the CLI stack gives out long before the services do, so k6 can talk
// straight to the PostgREST / Storage / Realtime containers on this runner's Docker network (private addresses only).
const PRIVATE = /^(http|ws):\/\/(127\.0\.0\.1|localhost|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?(\/.*)?$/
const REST = __ENV.REST_DIRECT || `${BASE}/rest/v1`
const STORAGE = __ENV.STORAGE_DIRECT || `${BASE}/storage/v1`
const RT_DIRECT = __ENV.REALTIME_DIRECT || ''
for (const u of [REST, STORAGE, RT_DIRECT]) if (u && !PRIVATE.test(u)) throw new Error(`refusing: not a local address: ${u}`)
const MODE = __ENV.REST_DIRECT ? 'direct to the service containers' : 'through the local Kong gateway'
const url = (path) =>
  path.startsWith('/rest/v1') ? REST + path.slice(8) : path.startsWith('/storage/v1') ? STORAGE + path.slice(11) : `${BASE}${path}`

const PEAK = Number(__ENV.PEAK_VUS || 200)
const PAGE_VUS = Number(__ENV.PAGE_VUS || 20)
const WS_VUS = Number(__ENV.WS_VUS || 200)
const GOAL_RATE = Number(__ENV.GOAL_RATE || 100) // match-room messages per second during the goal
const RAMP_S = Number(__ENV.RAMP_S || 120)
const HOLD_S = Number(__ENV.HOLD_S || 300)
const SPIKE_S = 60
const DOWN_S = 30
const TOTAL_S = RAMP_S + HOLD_S + SPIKE_S + DOWN_S
const GOAL_AT_S = RAMP_S + Math.round(HOLD_S / 2)

// SharedArray: parsed once, one element at a time per VU (never the whole 15 MB file per VU).
const FANS = new SharedArray('fans', () => JSON.parse(open(__ENV.FANS_FILE)).fans.filter((f) => f.i > 100))
const LIVE = new SharedArray('live', () => [JSON.parse(open(__ENV.FANS_FILE)).live])[0]
const LIVE_FANS = new SharedArray('live fans', () => {
  const d = JSON.parse(open(__ENV.FANS_FILE))
  return d.fans.filter((f) => f.i > 100 && (f.team === d.live.home || f.team === d.live.away))
})

const s = (n) => `${n}s`
export const options = {
  discardResponseBodies: false,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
  scenarios: {
    api: {
      executor: 'ramping-vus',
      exec: 'api',
      startVUs: 0,
      stages: [
        { duration: s(RAMP_S), target: PEAK },
        { duration: s(HOLD_S), target: PEAK },
        { duration: s(SPIKE_S), target: PEAK },
        { duration: s(DOWN_S), target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    goal: {
      executor: 'ramping-arrival-rate',
      exec: 'goal',
      startTime: s(GOAL_AT_S),
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: Math.max(20, Math.round(GOAL_RATE / 2)),
      maxVUs: Math.max(50, GOAL_RATE * 3),
      stages: [
        { duration: '5s', target: GOAL_RATE },
        { duration: '45s', target: GOAL_RATE },
        { duration: '10s', target: 0 },
      ],
    },
    realtime: {
      executor: 'ramping-vus',
      exec: 'realtime',
      startVUs: 0,
      stages: [
        { duration: s(RAMP_S), target: WS_VUS },
        { duration: s(HOLD_S + SPIKE_S), target: WS_VUS },
        { duration: s(DOWN_S), target: 0 },
      ],
      gracefulRampDown: '5s',
    },
    ...(APP && PAGE_VUS > 0
      ? {
          pages: {
            executor: 'ramping-vus',
            exec: 'pages',
            startVUs: 0,
            stages: [
              { duration: s(RAMP_S), target: PAGE_VUS },
              { duration: s(HOLD_S + SPIKE_S), target: PAGE_VUS },
              { duration: s(DOWN_S), target: 0 },
            ],
            gracefulRampDown: '20s',
          },
        }
      : {}),
  },
  thresholds: {},
}

// Every request has a name; a threshold per name makes its own line in the summary (informative only).
const NAMES = [
  'profile', 'private_profile', 'unread_count', 'stories', 'hot_clips', 'clip_likes_of', 'clip_respects_of', 'sign_urls',
  'players', 'player_reviews', 'chat_preview', 'blocks', 'war_totals', 'war_mine', 'events_count', 'market_count',
  'trips_count', 'chants_count', 'team_chat_read', 'team_chat_send', 'match_read', 'match_send', 'match_polls',
  'goal_send', 'square_page1', 'square_page2', 'square_like', 'square_comment', 'square_comments', 'inbox_threads',
  'inbox_groups', 'dm_read', 'dm_keys', 'dm_send', 'ratings_stats', 'ratings_mine', 'rating_save', 'activity_page',
  'activity_seen', 'mark_seen', 'my_guesses', 'guess_save', 'board',
  'page_home', 'page_chat', 'page_match', 'page_square', 'page_inbox', 'page_me', 'page_trips', 'page_activity',
]
for (const n of NAMES) {
  options.thresholds[`http_req_duration{name:${n}}`] = ['p(95)<1000']
  options.thresholds[`http_req_failed{name:${n}}`] = ['rate<0.01']
}
for (const sc of ['api', 'goal', 'pages']) options.thresholds[`http_req_duration{scenario:${sc}}`] = ['p(95)<1000']
const ERROR_KINDS = ['rate_limit', 'rule', 'conflict', 'client', 'server', 'network', 'redirect_login']
const appErrors = new Counter('app_errors')
for (const k of ERROR_KINDS) options.thresholds[`app_errors{kind:${k}}`] = ['count>=0']

const rtJoin = new Trend('rt_join_ms', true)
const rtDelivery = new Trend('rt_delivery_ms', true)
const rtSessions = new Counter('rt_sessions_opened')
const rtConnectFail = new Counter('rt_connect_failed')
const rtJoinOk = new Counter('rt_join_ok')
const rtJoinErr = new Counter('rt_join_error')
const rtClosedEarly = new Counter('rt_closed_early')
const rtBroadcasts = new Counter('rt_broadcasts')
const rtPresence = new Counter('rt_presence_events')
const sent = new Counter('messages_sent')
for (const t of ['team', 'match', 'inbox', 'online', 'room']) options.thresholds[`rt_join_ms{topic:${t}}`] = ['p(95)<2000']
options.thresholds['rt_delivery_ms'] = ['p(95)<2000']
for (const t of ['team', 'match', 'inbox']) {
  options.thresholds[`rt_delivery_ms{topic:${t}}`] = ['p(95)<2000']
  options.thresholds[`messages_sent{kind:${t}}`] = ['count>=0']
}
options.thresholds['messages_sent{kind:goal}'] = ['count>=0']

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
const CLIP_COLUMNS =
  'id,user_id,team_id,nick,media_path,kind,caption,tags,once,likes_count,respects_count,comments_count,views_count,created_at,expires_at,audience'
const MESSAGE_COLUMNS = 'id,user_id,nick,body,created_at,reply_to,reply_user,reply_nick,reply_body'
const enc = encodeURIComponent
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const think = (lo, hi) => sleep(lo + Math.random() * (hi - lo))

function fanOf(offset = 0) {
  return FANS[(exec.vu.idInTest - 1 + offset) % FANS.length]
}
function hdr(fan, extra) {
  return Object.assign({ apikey: KEY, Authorization: `Bearer ${fan.token}`, 'Content-Type': 'application/json' }, extra || {})
}
function classify(res) {
  if (res.status >= 200 && res.status < 300) return null
  const b = typeof res.body === 'string' ? res.body : ''
  if (res.status === 0) return 'network'
  if (b.includes('rate_limit')) return 'rate_limit'
  if (/awaiting_accept|blocked|room_closed|not_playing|locked|offensive_content|bad_reply/.test(b)) return 'rule'
  if (res.status === 409) return 'conflict'
  if (res.status >= 500) return 'server'
  return 'client'
}
function note(res, name) {
  const k = classify(res)
  if (k) appErrors.add(1, { kind: k, name })
  return res
}
function get(fan, path, name, extra) {
  return note(http.get(url(path), { headers: hdr(fan, extra), tags: { name } }), name)
}
function head(fan, path, name) {
  return note(http.request('HEAD', url(path), null, { headers: hdr(fan, { Prefer: 'count=exact' }), tags: { name } }), name)
}
function post(fan, path, body, name, extra) {
  return note(http.post(url(path), JSON.stringify(body), { headers: hdr(fan, extra), tags: { name } }), name)
}
function patch(fan, path, body, name, extra) {
  return note(http.patch(url(path), JSON.stringify(body), { headers: hdr(fan, extra), tags: { name } }), name)
}
function rpc(fan, fn, args, name) {
  return post(fan, `/rest/v1/rpc/${fn}`, args || {}, name)
}
function json(res) {
  try {
    return res.status >= 200 && res.status < 300 ? res.json() : null
  } catch {
    return null
  }
}
function keyset(field, row) {
  return `&or=${enc(`(${field}.lt."${row[field]}",and(${field}.eq."${row[field]}",id.lt.${row.id}))`)}`
}
// A ciphertext-shaped dummy (random base64): private messages never carry plaintext, here as in the app.
function cipherDummy(n) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let s = ''
  for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * 64)]
  return s
}

// The clips decorate() step: my likes and respects of a page, one request each, and the signed URLs in one batch.
function decorate(fan, rows) {
  if (!rows || rows.length === 0) return
  const ids = rows.map((r) => r.id).join(',')
  get(fan, `/rest/v1/clip_likes?select=clip_id&clip_id=in.(${ids})`, 'clip_likes_of')
  get(fan, `/rest/v1/clip_respects?select=clip_id&clip_id=in.(${ids})`, 'clip_respects_of')
  const paths = rows.filter((r) => !r.once || r.user_id === fan.id).map((r) => r.media_path)
  if (paths.length) post(fan, '/storage/v1/object/sign/clips', { expiresIn: 3600, paths }, 'sign_urls')
}

// ── API flows ───────────────────────────────────────────────────────────────────────────────────────────────────
function home(fan) {
  // session gate + birth date gate + bell (every app page)
  get(fan, `/rest/v1/profiles?select=nick,team_id&user_id=eq.${fan.id}`, 'profile')
  rpc(fan, 'my_private_profile', {}, 'private_profile')
  rpc(fan, 'activity_unread_count', {}, 'unread_count')
  get(fan, '/rest/v1/blocks?select=blocked_id', 'blocks')
  const stories = json(
    get(fan, `/rest/v1/clips?select=${CLIP_COLUMNS},clip_views(user_id)&team_id=eq.${fan.team}&once=eq.false&order=created_at.desc,id.desc&limit=60`, 'stories'),
  )
  decorate(fan, (stories || []).slice(0, 15))
  const hot = json(get(fan, `/rest/v1/clips?select=${CLIP_COLUMNS}&once=eq.false&order=likes_count.desc,created_at.desc&limit=8`, 'hot_clips'))
  decorate(fan, (hot || []).slice(0, 4))
  get(fan, `/rest/v1/players?select=id,number,name_short,position,player_rating_stats(sum,count)&team_id=eq.${fan.team}`, 'players')
  rpc(fan, 'home_player_reviews', { p_per_player: 5 }, 'player_reviews')
  get(fan, `/rest/v1/team_messages?select=id,user_id,nick,body,created_at&team_id=eq.${fan.team}&order=created_at.desc,id.desc&limit=6`, 'chat_preview')
  if (fan.fixture) {
    get(fan, `/rest/v1/crowd_war_totals?select=team_id,points&fixture_id=eq.${fan.fixture}`, 'war_totals')
    get(fan, `/rest/v1/crowd_war_fans?select=points&fixture_id=eq.${fan.fixture}`, 'war_mine')
    head(fan, `/rest/v1/trips?select=id&fixture_id=eq.${fan.fixture}`, 'trips_count')
  }
  head(fan, `/rest/v1/fan_events?select=id&starts_at=gte.${enc(new Date(Date.now() - 3 * 3600e3).toISOString())}`, 'events_count')
  head(fan, '/rest/v1/market_items?select=id&sold=eq.false', 'market_count')
  head(fan, '/rest/v1/chants?select=id', 'chants_count')
}

function teamChat(fan) {
  const page = json(get(fan, `/rest/v1/team_messages?select=${MESSAGE_COLUMNS}&order=created_at.desc,id.desc&limit=50`, 'team_chat_read'))
  get(fan, '/rest/v1/blocks?select=blocked_id', 'blocks')
  if (page && page.length === 50 && Math.random() < 0.15) {
    get(fan, `/rest/v1/team_messages?select=${MESSAGE_COLUMNS}&order=created_at.desc,id.desc&limit=50${keyset('created_at', page[49])}`, 'team_chat_read')
  }
  if (Math.random() < 0.35) {
    const r = post(
      fan,
      `/rest/v1/team_messages?select=${MESSAGE_COLUMNS}`,
      { body: `[נתוני עומס] יאללה t=${Date.now()}`, reply_to: null },
      'team_chat_send',
      { Prefer: 'return=representation', Accept: 'application/vnd.pgrst.object+json' },
    )
    if (r.status === 201) sent.add(1, { kind: 'team' })
  }
}

function matchRoom(fan, body) {
  get(fan, `/rest/v1/match_messages?select=${MESSAGE_COLUMNS},side&fixture_id=eq.${LIVE.id}&order=created_at.desc,id.desc&limit=50`, 'match_read')
  get(
    fan,
    `/rest/v1/match_polls?select=id,fixture_id,kind,question,options,options_in,source,voter_scope,opens_at,closes_at,summary&fixture_id=eq.${LIVE.id}&order=opens_at.desc&limit=5`,
    'match_polls',
  )
  if (fan.team === LIVE.home || fan.team === LIVE.away) {
    if (Math.random() < 0.5) sendMatch(fan, body || `[נתוני עומס] קדימה t=${Date.now()}`, 'match_send', 'match')
  }
}
function sendMatch(fan, text, name, kind) {
  const r = post(
    fan,
    `/rest/v1/match_messages?select=${MESSAGE_COLUMNS},side`,
    { fixture_id: LIVE.id, body: text, reply_to: null },
    name,
    { Prefer: 'return=representation', Accept: 'application/vnd.pgrst.object+json' },
  )
  if (r.status === 201) sent.add(1, { kind })
}

function square(fan) {
  get(fan, '/rest/v1/blocks?select=blocked_id', 'blocks')
  const audience = Math.random() < 0.8 ? 'all' : 'team'
  const base = `/rest/v1/clips?select=${CLIP_COLUMNS}&audience=eq.${audience}&order=created_at.desc,id.desc&limit=20`
  const p1 = json(get(fan, base, 'square_page1')) || []
  decorate(fan, p1)
  let rows = p1
  if (p1.length === 20 && Math.random() < 0.6) {
    const p2 = json(get(fan, base + keyset('created_at', p1[19]), 'square_page2')) || []
    decorate(fan, p2)
    rows = p1.concat(p2)
  }
  if (rows.length === 0) return
  const clip = pick(rows)
  if (Math.random() < 0.35) {
    // A fan likes a post once: 409 = already liked (counted as "conflict", not as a server error).
    const r = http.post(url('/rest/v1/clip_likes'), JSON.stringify({ clip_id: clip.id }), {
      headers: hdr(fan),
      tags: { name: 'square_like' },
      responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 409),
    })
    note(r, 'square_like')
  }
  if (Math.random() < 0.2) {
    get(fan, `/rest/v1/clip_comments?select=id,user_id,team_id,nick,body,created_at&clip_id=eq.${clip.id}&order=created_at,id&limit=100`, 'square_comments')
    if (Math.random() < 0.4) {
      post(fan, '/rest/v1/clip_comments?select=id,user_id,team_id,nick,body,created_at', { clip_id: clip.id, body: '[נתוני עומס] אש' }, 'square_comment', {
        Prefer: 'return=representation',
      })
    }
  }
}

function inbox(fan) {
  get(
    fan,
    '/rest/v1/dm_threads?select=id,user_a,user_b,nick_a,nick_b,team_a,team_b,last_at,last_from,last_message_id,unread_a,unread_b,accepted_at,opened_by&order=last_at.desc&limit=100',
    'inbox_threads',
  )
  get(
    fan,
    `/rest/v1/dm_group_members?select=group_id,role,invited_by,invited_at,unread,muted,dm_groups(id,name,last_at,last_from,last_message_id,members_count)&user_id=eq.${fan.id}&limit=100`,
    'inbox_groups',
  )
  get(fan, '/rest/v1/blocks?select=blocked_id', 'blocks')
  if (!fan.thread) return
  get(fan, `/rest/v1/dm_messages?select=id,sender_id,sender_device,iv,ciphertext,wrapped_keys,created_at,reply_to&thread_id=eq.${fan.thread}&order=created_at.desc&limit=50`, 'dm_read')
  rpc(fan, 'mark_read', { p_kind: 'dm', p_id: fan.thread }, 'mark_seen')
  if (Math.random() < 0.35) {
    get(fan, `/rest/v1/device_keys?select=user_id,device_id,public_jwk,created_at&user_id=in.(${fan.id},${fan.peer})`, 'dm_keys')
    const wrapped = {}
    wrapped[`loaddev${fan.i}`] = { i: cipherDummy(16), w: cipherDummy(64) }
    wrapped[`peer${fan.peer.slice(0, 8)}`] = { i: cipherDummy(16), w: cipherDummy(64) }
    const r = post(
      fan,
      '/rest/v1/dm_messages?select=id,sender_id,created_at,reply_to',
      { thread_id: fan.thread, sender_device: `loaddev${fan.i}`, iv: cipherDummy(16), ciphertext: cipherDummy(120), wrapped_keys: wrapped, reply_to: null },
      'dm_send',
      { Prefer: 'return=representation', Accept: 'application/vnd.pgrst.object+json' },
    )
    if (r.status === 201) sent.add(1, { kind: 'inbox' })
  }
}

let squad = null
function ratings(fan) {
  const players = json(get(fan, `/rest/v1/players?select=id,number,name_he,name_short,position,injured,in_xi,pitch_x,pitch_y&team_id=eq.${fan.team}`, 'players'))
  get(fan, '/rest/v1/player_rating_stats?select=player_id,sum,count', 'ratings_stats')
  get(fan, `/rest/v1/player_ratings?select=player_id,stars,review&user_id=eq.${fan.id}`, 'ratings_mine')
  squad = (players || []).filter((p) => p.number !== null)
  if (squad.length === 0 || Math.random() < 0.5) return
  const p = pick(squad)
  const stars = 1 + Math.floor(Math.random() * 5)
  const up = patch(fan, `/rest/v1/player_ratings?player_id=eq.${p.id}&user_id=eq.${fan.id}&select=player_id`, { stars, review: '' }, 'rating_save', {
    Prefer: 'return=representation',
  })
  const rows = json(up)
  if (rows && rows.length === 0) post(fan, '/rest/v1/player_ratings', { player_id: p.id, stars, review: '' }, 'rating_save')
}

function activity(fan) {
  rpc(fan, 'activity_unread_count', {}, 'unread_count')
  const since = new Date(Date.now() - 60 * 24 * 3600e3).toISOString()
  const rows = json(
    get(
      fan,
      `/rest/v1/activity?select=id,kind,actor_id,actor_count,updated_at,trip_id,clips(media_path,kind,audience),team_photos(media_path),trips(nick,from_city)&user_id=eq.${fan.id}&updated_at=gt.${enc(since)}&order=updated_at.desc,id.desc&limit=21`,
      'activity_page',
    ),
  )
  get(fan, `/rest/v1/activity_seen?select=seen_at&user_id=eq.${fan.id}`, 'activity_seen')
  if (rows && rows.length) rpc(fan, 'mark_activity_seen', { p_upto: rows[0].updated_at }, 'mark_seen')
}

function predictions(fan) {
  if (!fan.fixture) return
  get(fan, `/rest/v1/predictions?select=fixture_id,home_goals,away_goals,points&fixture_id=in.(${fan.fixture})`, 'my_guesses')
  get(fan, `/rest/v1/prediction_totals?select=user_id,points,exact,played&team_id=eq.${fan.team}&season=eq.2026&order=points.desc,exact.desc&limit=20`, 'board')
  if (fan.fixture === LIVE.id) return // kicked off: locked
  const h = Math.floor(Math.random() * 4)
  const a = Math.floor(Math.random() * 3)
  const up = json(
    patch(fan, `/rest/v1/predictions?fixture_id=eq.${fan.fixture}&select=fixture_id`, { home_goals: h, away_goals: a }, 'guess_save', { Prefer: 'return=representation' }),
  )
  if (up && up.length === 0) post(fan, '/rest/v1/predictions', { fixture_id: fan.fixture, home_goals: h, away_goals: a }, 'guess_save')
}

// A fan's session: one screen at a time with a pause between screens (weights ≈ how often each screen opens).
const FLOWS = [
  [25, home],
  [22, teamChat],
  [15, matchRoom],
  [18, square],
  [10, inbox],
  [4, ratings],
  [4, activity],
  [2, predictions],
]
const FLOW_TOTAL = FLOWS.reduce((a, f) => a + f[0], 0)
export function api() {
  const fan = fanOf()
  let r = Math.random() * FLOW_TOTAL
  for (const [w, fn] of FLOWS) {
    if ((r -= w) < 0) {
      fn(fan)
      break
    }
  }
  think(2, 6)
}

// The goal: fans of the two clubs flood the live room ("גול" is a crowd keyword: the burst counter and poll run).
export function goal() {
  const fan = LIVE_FANS[exec.scenario.iterationInTest % LIVE_FANS.length]
  // Some fans shout "פנדל" (a crowd keyword): 15 different fans within 60 s open a crowd-verdict poll, as in a real match.
  const text = Math.random() < 0.3 ? `[נתוני עומס] פנדל!! t=${Date.now()}` : `[נתוני עומס] גווול!!! גול t=${Date.now()}`
  sendMatch(fan, text, 'goal_send', 'goal')
}

// ── Real pages (Next.js server rendering as the fan, cookie session) ─────────────────────────────────────────────
const PAGES = [
  ['page_home', () => '/stand'],
  ['page_chat', () => '/stand/chat'],
  ['page_match', () => `/matches/${LIVE.id}`],
  ['page_square', () => '/square'],
  ['page_inbox', () => '/inbox'],
  ['page_me', () => '/me'],
  ['page_trips', () => '/stand/trips'],
  ['page_activity', () => '/activity'],
]
export function pages() {
  const fan = fanOf(Math.floor(FANS.length / 2)) // other fans than the api scenario's
  const [name, path] = pick(PAGES)
  const res = http.get(`${APP}${path()}`, { headers: { Cookie: fan.cookie, 'Accept-Language': 'he-IL' }, tags: { name }, redirects: 5 })
  const signedIn = !/\/(login|onboarding)(\?|$)/.test(res.url || '')
  if (!signedIn) appErrors.add(1, { kind: 'redirect_login', name })
  else note(res, name)
  check(res, { 'page 200': (r) => r.status === 200, 'page as the fan (no login redirect)': () => signedIn })
  think(3, 8)
}

// ── Realtime (Phoenix protocol over websocket, as realtime-js v2 speaks it) ────────────────────────────────────
const WS_URL = RT_DIRECT
  ? `${RT_DIRECT}/socket/websocket?apikey=${enc(KEY)}&vsn=1.0.0`
  : `${BASE.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${enc(KEY)}&vsn=1.0.0`
// Realtime picks the tenant from the first label of the Host header (Kong sets it; direct mode must too).
const WS_PARAMS = RT_DIRECT ? { headers: { Host: 'realtime-dev.localhost' }, tags: { name: 'realtime' } } : { tags: { name: 'realtime' } }
export function realtime() {
  const fan = fanOf()
  const started = exec.scenario.startTime
  const end = started + TOTAL_S * 1000 - 3000
  const left = end - Date.now()
  if (left < 5000) return sleep(Math.max(1, left / 1000))
  const live = fan.team === LIVE.home || fan.team === LIVE.away
  const topics = [
    ['online', `online:${fan.team}`, true],
    ['team', `team:${fan.team}`, false],
    ['inbox', `inbox:${fan.id}`, false],
  ]
  if (live) topics.push(['match', `match:${LIVE.id}`, false], ['room', `room:${LIVE.id}`, true])
  let ref = 0
  let planned = false
  const res = ws.connect(WS_URL, WS_PARAMS, (socket) => {
    socket.on('open', () => {
      rtSessions.add(1)
      const pending = {}
      const kindOf = {}
      for (const [kind, topic, presence] of topics) {
        const r = String(++ref)
        pending[r] = { kind, at: Date.now(), topic: `realtime:${topic}`, presence }
        kindOf[`realtime:${topic}`] = kind
        socket.send(
          JSON.stringify({
            topic: `realtime:${topic}`,
            event: 'phx_join',
            ref: r,
            join_ref: r,
            payload: {
              config: { broadcast: { ack: false, self: false }, presence: { key: presence ? fan.id : '', enabled: presence }, postgres_changes: [], private: true },
              access_token: fan.token,
            },
          }),
        )
      }
      socket.on('message', (raw) => {
        let m
        try {
          m = JSON.parse(raw)
        } catch {
          return
        }
        if (m.event === 'phx_reply' && pending[m.ref]) {
          const p = pending[m.ref]
          delete pending[m.ref]
          if (m.payload && m.payload.status === 'ok') {
            rtJoinOk.add(1, { topic: p.kind })
            rtJoin.add(Date.now() - p.at, { topic: p.kind })
            if (p.presence) {
              socket.send(
                JSON.stringify({ topic: p.topic, event: 'presence', ref: String(++ref), join_ref: m.ref, payload: { type: 'presence', event: 'track', payload: { user_id: fan.id } } }),
              )
            }
          } else rtJoinErr.add(1, { topic: p.kind })
          return
        }
        if (m.event === 'system' && m.payload && m.payload.status === 'error') {
          rtJoinErr.add(1, { topic: kindOf[m.topic] || 'other' })
          return
        }
        if (m.event === 'presence_diff' || m.event === 'presence_state') {
          rtPresence.add(1)
          return
        }
        if (m.event === 'broadcast') {
          const kind = kindOf[m.topic] || 'other'
          rtBroadcasts.add(1, { topic: kind })
          const rec = m.payload && m.payload.payload && m.payload.payload.record
          const t = rec && typeof rec.body === 'string' ? /t=(\d{13})/.exec(rec.body) : null
          if (t) rtDelivery.add(Date.now() - Number(t[1]), { topic: kind })
          else if (kind === 'inbox' && m.payload && m.payload.event === 'message') rtDelivery.add(0, { topic: 'inbox_ping' })
        }
      })
      socket.setInterval(() => socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })), 25000)
      socket.setTimeout(() => {
        planned = true
        socket.close()
      }, left)
    })
    socket.on('error', () => {})
    socket.on('close', () => {
      if (!planned) rtClosedEarly.add(1)
    })
  })
  if (!res || res.status !== 101) {
    rtConnectFail.add(1)
    sleep(5)
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────────────────────────────────────────
function ms(v) {
  return v === undefined || v === null ? '–' : `${Math.round(v)}`
}
export function handleSummary(d) {
  const m = d.metrics
  const dur = d.state.testRunDurationMs / 1000
  const val = (k, f) => (m[k] && m[k].values ? m[k].values[f] : undefined)
  const lines = []
  lines.push(`### k6: ${PEAK} api fans + ${WS_VUS} realtime sessions + ${APP ? PAGE_VUS : 0} page fans, goal ${GOAL_RATE}/s`)
  lines.push('')
  lines.push(`API and realtime traffic: ${MODE}. Pages: the Next.js build on this runner (it reaches Supabase through the local Kong).`)
  lines.push('')
  lines.push(
    `Run ${Math.round(dur)} s · requests ${val('http_reqs', 'count')} (${(val('http_reqs', 'rate') || 0).toFixed(1)}/s) · ` +
      `failed ${((val('http_req_failed', 'rate') || 0) * 100).toFixed(2)}% · p50 ${ms(val('http_req_duration', 'med'))} ms · ` +
      `p95 ${ms(val('http_req_duration', 'p(95)'))} ms · p99 ${ms(val('http_req_duration', 'p(99)'))} ms · max VUs ${val('vus_max', 'max')}`,
  )
  lines.push('')
  lines.push('| request | count | per s | p50 ms | p95 ms | p99 ms | max ms | failed |')
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const n of NAMES) {
    const t = m[`http_req_duration{name:${n}}`]
    if (!t || !t.values || !t.values.count) continue
    const f = m[`http_req_failed{name:${n}}`]
    lines.push(
      `| ${n} | ${t.values.count} | ${(t.values.count / dur).toFixed(1)} | ${ms(t.values.med)} | ${ms(t.values['p(95)'])} | ${ms(t.values['p(99)'])} | ${ms(t.values.max)} | ${f ? (f.values.rate * 100).toFixed(2) : '0.00'}% |`,
    )
  }
  lines.push('')
  lines.push('| scenario | p50 ms | p95 ms | p99 ms |')
  lines.push('|---|---:|---:|---:|')
  for (const sc of ['api', 'goal', 'pages']) {
    const t = m[`http_req_duration{scenario:${sc}}`]
    if (t && t.values && t.values.count) lines.push(`| ${sc} | ${ms(t.values.med)} | ${ms(t.values['p(95)'])} | ${ms(t.values['p(99)'])} |`)
  }
  lines.push('')
  lines.push('Errors by kind (rule = the app refusing on purpose: rate limit, room closed, blocked…):')
  lines.push('')
  lines.push(ERROR_KINDS.map((k) => `${k} ${val(`app_errors{kind:${k}}`, 'count') || 0}`).join(' · '))
  lines.push('')
  lines.push(
    `Messages sent: team ${val('messages_sent{kind:team}', 'count') || 0} · match ${val('messages_sent{kind:match}', 'count') || 0} · goal burst ${
      val('messages_sent{kind:goal}', 'count') || 0
    } · private (ciphertext) ${val('messages_sent{kind:inbox}', 'count') || 0}`,
  )
  lines.push('')
  lines.push(
    `Realtime: sessions opened ${val('rt_sessions_opened', 'count') || 0} · connect failed ${val('rt_connect_failed', 'count') || 0} · ` +
      `joins ok ${val('rt_join_ok', 'count') || 0} · join errors ${val('rt_join_error', 'count') || 0} · closed early ${val('rt_closed_early', 'count') || 0} · ` +
      `broadcasts received ${val('rt_broadcasts', 'count') || 0} · presence events ${val('rt_presence_events', 'count') || 0}`,
  )
  lines.push('')
  lines.push('| realtime | count | p50 ms | p95 ms | p99 ms | max ms |')
  lines.push('|---|---:|---:|---:|---:|---:|')
  for (const t of ['team', 'match', 'inbox', 'online', 'room']) {
    const j = m[`rt_join_ms{topic:${t}}`]
    if (j && j.values && j.values.count) lines.push(`| join ${t} | ${j.values.count} | ${ms(j.values.med)} | ${ms(j.values['p(95)'])} | ${ms(j.values['p(99)'])} | ${ms(j.values.max)} |`)
  }
  for (const t of ['team', 'match', 'inbox']) {
    const j = m[`rt_delivery_ms{topic:${t}}`]
    if (j && j.values && j.values.count)
      lines.push(`| delivery ${t} (send → received) | ${j.values.count} | ${ms(j.values.med)} | ${ms(j.values['p(95)'])} | ${ms(j.values['p(99)'])} | ${ms(j.values.max)} |`)
  }
  const md = lines.join('\n') + '\n'
  const out = __ENV.OUT_DIR || '.'
  return {
    [`${out}/k6-summary.json`]: JSON.stringify(d, null, 1),
    [`${out}/k6-summary.md`]: md,
    stdout: `::notice title=k6::requests ${val('http_reqs', 'count')} · ${(val('http_reqs', 'rate') || 0).toFixed(1)}/s · p95 ${ms(val('http_req_duration', 'p(95)'))} ms · failed ${(
      (val('http_req_failed', 'rate') || 0) * 100
    ).toFixed(2)}%\n`,
  }
}
