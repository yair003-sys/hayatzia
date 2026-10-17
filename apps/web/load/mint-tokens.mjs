// LOAD TEST ONLY. Mints sessions for seeded fake fans of the LOCAL Supabase started inside the CI runner
// (.github/workflows/web-load-local.yml): an HS256 access token signed with that local stack's JWT secret, and the
// same session as the @supabase/ssr cookie the Next.js app reads ("sb-<host>-auth-token", "base64-" + base64url JSON),
// so Server Components render as that fan. No real account is created or touched anywhere.
//
//   JWT_SECRET=... SUPABASE_URL=http://127.0.0.1:54321 node load/mint-tokens.mjs fans.csv meta.csv out.json
// fans.csv (no header): i,user_id,team,thread_id,peer_id,group_id,fixture_id
// meta.csv (no header): key,value (from load.meta)
import { createHmac } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const [fansCsv, metaCsv, out] = process.argv.slice(2)
const secret = process.env.JWT_SECRET
const url = process.env.SUPABASE_URL ?? ''
if (!fansCsv || !metaCsv || !out || !secret) throw new Error('usage: JWT_SECRET=… SUPABASE_URL=… node mint-tokens.mjs fans.csv meta.csv out.json')
// Local only: never mint for a hosted project.
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error(`refusing: SUPABASE_URL must be the local stack, got ${url}`)

const b64url = (b) => Buffer.from(b).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const TTL = 8 * 3600 // the whole run fits in it; no refresh needed

function jwt(sub, email) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const claims = {
    aud: 'authenticated',
    exp: now + TTL,
    iat: now,
    iss: `${url}/auth/v1`,
    sub,
    email,
    phone: '',
    role: 'authenticated',
    aal: 'aal1',
    amr: [{ method: 'password', timestamp: now }],
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { load_test: true },
    is_anonymous: false,
  }
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

// @supabase/ssr: storage key from the project host ("127" for 127.0.0.1), value "base64-<base64url(JSON)>",
// split into ".0", ".1" … cookies above 3180 characters.
const cookieName = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
function cookies(token, sub, email) {
  const session = {
    access_token: token,
    token_type: 'bearer',
    expires_in: TTL,
    expires_at: now + TTL,
    refresh_token: `load-${sub.slice(0, 8)}`,
    user: {
      id: sub,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { load_test: true },
      created_at: new Date(now * 1000).toISOString(),
    },
  }
  const value = `base64-${b64url(JSON.stringify(session))}`
  if (value.length <= 3180) return [{ name: cookieName, value }]
  const parts = []
  for (let i = 0, k = 0; i < value.length; i += 3180, k++) parts.push({ name: `${cookieName}.${k}`, value: value.slice(i, i + 3180) })
  return parts
}

const meta = Object.fromEntries(
  readFileSync(metaCsv, 'utf8')
    .trim()
    .split('\n')
    .map((l) => {
      const at = l.indexOf(',')
      return [l.slice(0, at), l.slice(at + 1).replace(/^"|"$/g, '')]
    }),
)
const fans = readFileSync(fansCsv, 'utf8')
  .trim()
  .split('\n')
  .map((l) => {
    const [i, id, team, thread, peer, group, fixture] = l.split(',')
    const email = `${i}@load.onefan.test`
    const token = jwt(id, email)
    const c = cookies(token, id, email)
    return {
      i: Number(i),
      id,
      team,
      thread: thread || null,
      peer: peer || null,
      group: group || null,
      fixture: fixture ? Number(fixture) : null,
      token,
      cookie: c.map((x) => `${x.name}=${x.value}`).join('; '),
      cookies: c,
    }
  })

const live = { id: Number(meta.live_fixture), home: meta.live_home, away: meta.live_away }
writeFileSync(out, JSON.stringify({ live, users: Number(meta.users), fans }))
console.log(`minted ${fans.length} local sessions (cookie ${cookieName}); live match ${live.id} ${live.home}-${live.away}`)
