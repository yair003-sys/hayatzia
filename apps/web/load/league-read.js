// Load test (k6): many fans opening the matches page at once, against the STAGING project only.
// What it measures: the same PostgREST reads getLeague() makes (fixtures of a season, standings, teams), as role anon.
// Run by .github/workflows/web-load.yml (workflow_dispatch). Never point this at production.
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.SUPABASE_URL
const KEY = __ENV.SUPABASE_PUBLISHABLE_KEY
const PEAK = Number(__ENV.PEAK_VUS || 200)

if (!BASE || !KEY) throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required')
if (BASE.includes('loaqhisfhafjbrmtygrp')) throw new Error('Refusing to load-test the production project')

export const options = {
  scenarios: {
    fans: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.round(PEAK / 4) },
        { duration: '60s', target: PEAK },
        { duration: '60s', target: PEAK },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

export default function () {
  const season = 2024
  const res = http.batch([
    ['GET', `${BASE}/rest/v1/fixtures?select=id,season,round,kickoff_at,status,elapsed,home_api_id,away_api_id,home_goals,away_goals,venue&season=eq.${season}&order=kickoff_at`, null, { headers, tags: { name: 'fixtures' } }],
    ['GET', `${BASE}/rest/v1/standings?select=*&season=eq.${season}`, null, { headers, tags: { name: 'standings' } }],
    ['GET', `${BASE}/rest/v1/api_teams?select=api_id,name,logo`, null, { headers, tags: { name: 'api_teams' } }],
  ])
  for (const r of res) check(r, { 'status 200': (x) => x.status === 200 })
  sleep(1 + Math.random() * 2)
}

export function handleSummary(data) {
  const m = data.metrics
  const line = `peak ${PEAK} fans · requests ${m.http_reqs.values.count} · p95 ${Math.round(m.http_req_duration.values['p(95)'])}ms · median ${Math.round(m.http_req_duration.values.med)}ms · failed ${(m.http_req_failed.values.rate * 100).toFixed(2)}%`
  return { stdout: `::notice title=load test::${line}\n` }
}
