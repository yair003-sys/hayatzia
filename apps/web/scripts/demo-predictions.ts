// Staging-only demo of predictions: a labelled demo round with two upcoming matches and one finished match,
// and guesses from the labelled demo fans (created by demo-match.ts) so the season table has rows.
// Run: DEMO_TARGET=staging SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/demo-predictions.ts
import { notice, supabaseFromEnv } from './lib/rest.ts'

const PRODUCTION_REF = 'loaqhisfhafjbrmtygrp'
if (process.env.DEMO_TARGET !== 'staging' || (process.env.SUPABASE_URL ?? '').includes(PRODUCTION_REF)) {
  console.error('demo-predictions runs on staging only')
  process.exit(1)
}
const { rest } = supabaseFromEnv()
const json = async <T>(r: Response): Promise<T> => (await r.json()) as T
const DAY = 24 * 3600_000
const IDS = [900000011, 900000012, 900000013]

const fans = await json<{ user_id: string; team_id: string }[]>(await rest('GET', `profiles?nick=like.${encodeURIComponent('דמו·*')}&select=user_id,team_id`))
if (fans.length === 0) {
  console.error('no demo fans yet: run web-demo-match first')
  process.exit(1)
}
const latest = await json<{ season: number }[]>(await rest('GET', 'fixtures?select=season&order=season.desc&limit=1'))
const season = latest[0]?.season ?? 2024

// Start clean: old demo round (cascades guesses) and the demo fans' season totals.
await rest('DELETE', `fixtures?id=in.(${IDS.join(',')})`)
await rest('DELETE', `prediction_totals?user_id=in.(${fans.map((f) => f.user_id).join(',')})`)

const base = { league_id: 383, season, round: 'Demo Round - 1', status: 'NS', venue: 'משחק לדוגמה', is_demo: true }
const soon = new Date(Date.now() + 2 * DAY).toISOString()
await rest('POST', 'fixtures', [
  { ...base, id: IDS[0], kickoff_at: soon, home_api_id: 604, away_api_id: 563 },
  { ...base, id: IDS[1], kickoff_at: soon, home_api_id: 4195, away_api_id: 657 },
  { ...base, id: IDS[2], kickoff_at: new Date(Date.now() + DAY).toISOString(), home_api_id: 563, away_api_id: 604 },
], 'return=minimal')

// Demo fans guess the match that will be "played" (guesses are only accepted before kick-off).
let guesses = 0
for (const f of fans) {
  const home = Math.floor(Math.random() * 3)
  const away = Math.floor(Math.random() * 3)
  await rest('POST', 'predictions', { user_id: f.user_id, team_id: f.team_id, fixture_id: IDS[2], home_goals: home, away_goals: away }, 'return=minimal')
  guesses++
}
// …then the match is over: 1–2. The database scores every guess and fills the season table.
await rest('PATCH', `fixtures?id=eq.${IDS[2]}`, { kickoff_at: new Date(Date.now() - DAY).toISOString(), status: 'FT', home_goals: 1, away_goals: 2 }, 'return=minimal')

notice('demo predictions', `demo round ready (${guesses} demo guesses scored). Open /matches/predict on the preview.`)
