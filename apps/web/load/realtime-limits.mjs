// LOAD TEST ONLY: raises the LOCAL Realtime tenant's limits through Realtime's own management API (inside this CI
// runner's Docker network), so the runner, not a quota, is what stops the test. The local defaults (200 users,
// 100 events/s, 100 joins/s) are printed first: they match a small hosted plan and are reported as such.
//   node load/realtime-limits.mjs http://<realtime container ip>:4000 <API_JWT_SECRET of that container>
import { createHmac } from 'node:crypto'

const [base, secret] = process.argv.slice(2)
if (!base || !secret) throw new Error('usage: realtime-limits.mjs <base> <secret>')
if (!/^http:\/\/(\d+\.\d+\.\d+\.\d+|localhost):4000$/.test(base)) throw new Error(`refusing: not a local Realtime container: ${base}`)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iat: now, exp: now + 600, role: 'service_role' })}`
const jwt = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
const LIMITS = ['max_concurrent_users', 'max_events_per_second', 'max_joins_per_second', 'max_channels_per_client', 'max_bytes_per_second']
const pick = (t) => Object.fromEntries(LIMITS.map((k) => [k, t?.[k]]))

const get = async () => {
  const r = await fetch(`${base}/api/tenants/realtime-dev`, { headers })
  const j = await r.json().catch(() => null)
  return { status: r.status, limits: pick(j?.data ?? j) }
}
console.log('before', JSON.stringify(await get()))
const put = await fetch(`${base}/api/tenants/realtime-dev`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    tenant: {
      max_concurrent_users: 100000,
      max_events_per_second: 100000,
      max_joins_per_second: 10000,
      max_channels_per_client: 100,
      max_bytes_per_second: 1000000000,
    },
  }),
})
console.log('update', put.status) // the body is not printed: it can carry the tenant's secrets
console.log('after', JSON.stringify(await get()))
