// Copies the legacy league JSON (repo-root data/) into one Supabase project.
// Run: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/ingest-league.ts   (Node ≥ 22.18 strips the types)
// Needs no npm install: plain fetch against PostgREST. Idempotent: every write is an upsert.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { FixtureDetail, League } from '../src/features/matches/schema.ts'
import { toRows } from '../src/features/matches/ingest/rows.ts'

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, '../../../data')
const URL_BASE = process.env.SUPABASE_URL
// Pasting from a Hebrew (RTL) keyboard can add invisible direction marks: strip whitespace and format characters.
const KEY = process.env.SUPABASE_SECRET_KEY?.replace(/[\s\p{Cf}]/gu, '')
const CHUNK = 500

if (!URL_BASE || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}
if (!/^[\x21-\x7e]+$/.test(KEY)) {
  const masked = KEY.includes('\u2022')
  console.error(
    `SUPABASE_SECRET_KEY is not a plain key (length ${KEY.length}, masked dots: ${masked}): copy the full key after revealing it`,
  )
  process.exit(1)
}

const headers = { apikey: KEY, 'Content-Type': 'application/json' }

async function rest(method: string, pathAndQuery: string, body?: unknown, prefer?: string): Promise<void> {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathAndQuery}`, {
    method,
    headers: prefer ? { ...headers, Prefer: prefer } : headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${pathAndQuery} → ${res.status} ${await res.text()}`)
}

async function upsert(table: string, rows: object[], onConflict: string): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const stamped = rows.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: runStartedAt }))
    await rest('POST', `${table}?on_conflict=${onConflict}`, stamped, 'resolution=merge-duplicates,return=minimal')
  }
  console.log(`${table}: ${rows.length}`)
  counts.push(`${table}=${rows.length}`)
}
const counts: string[] = []

const runStartedAt = new Date().toISOString()
const league = JSON.parse(await readFile(path.join(DATA_DIR, 'league.json'), 'utf8')) as League
league.standings ??= []

const details: Record<number, FixtureDetail> = {}
const fxDir = path.join(DATA_DIR, 'fx')
for (const file of await readdir(fxDir).catch(() => [] as string[])) {
  if (!file.endsWith('.json')) continue
  const d = JSON.parse(await readFile(path.join(fxDir, file), 'utf8')) as FixtureDetail & { id: number }
  details[d.id] = { ev: d.ev ?? [], lu: d.lu ?? [] }
}

const rows = toRows(league, details)
await upsert('api_teams', rows.apiTeams, 'api_id')
await upsert('fixtures', rows.fixtures, 'id')
await upsert('standings', rows.standings, 'season,group_name,api_team_id')
await upsert('fixture_details', rows.details, 'fixture_id')

// Rows of this season that the upstream table no longer contains (e.g. a group renamed) go away.
if (rows.standings.length > 0) {
  const season = league.league.season
  await rest('DELETE', `standings?season=eq.${season}&updated_at=lt.${encodeURIComponent(runStartedAt)}`)
}
console.log(`done: season ${league.league.season}`)
// Shows up as an annotation on the run (readable through the GitHub API, unlike raw logs).
if (process.env.GITHUB_ACTIONS) console.log(`::notice title=ingest::season ${league.league.season} ${counts.join(' ')}`)
