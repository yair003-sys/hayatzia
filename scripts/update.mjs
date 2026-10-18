// Pulls Ligat Ha'Al data from API-Football and writes static JSON for the app.
// Runs every 10 minutes in GitHub Actions. Designed to stay inside the free plan (100 requests/day):
//  - the full fixture list is refreshed every run only around live matches, otherwise every 3 hours
//  - standings every 6 hours, or right after a match finishes
//  - lineups + events (2 requests per match) for live matches every run, then backfill 2 finished matches per run
//  - a hard daily cap stops all requests before the plan limit
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const KEY = process.env.API_FOOTBALL_KEY;
const LEAGUE = Number(process.env.LEAGUE || 383);
// The football season label (API-Football uses the starting year). It flips in the summer, so from July
// on it is the current calendar year, before that the previous one. Auto-detected so no yearly edit is needed;
// an explicit SEASON env (repo variable) still overrides, e.g. to backfill a past season.
function currentSeason() {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}
const SEASON = Number(process.env.SEASON) || currentSeason();
const DAILY_CAP = Number(process.env.DAILY_CAP || 90);
const BASE = process.env.API_BASE || 'https://v3.football.api-sports.io';
const DIR = 'data';
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const DONE = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const H = 3600e3, M = 60e3;

if (!KEY) { console.error('Missing API_FOOTBALL_KEY secret'); process.exit(1); }

const readJSON = async (p, d) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };
const israelDay = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

const meta = await readJSON(`${DIR}/meta.json`, {});
const league = await readJSON(`${DIR}/league.json`, null);
const now = Date.now();
if (meta.day !== israelDay(now)) { meta.day = israelDay(now); meta.req = 0; }
if (meta.season !== SEASON) { meta.lastFull = 0; meta.lastStand = 0; meta.season = SEASON; }

let made = 0, changed = false;
async function api(path) {
  if ((meta.req || 0) >= DAILY_CAP) { console.log('daily cap reached, skipping', path); return null; }
  const r = await fetch(BASE + path, { headers: { 'x-apisports-key': KEY } });
  meta.req = (meta.req || 0) + 1; made++;
  const left = Number(r.headers.get('x-ratelimit-requests-remaining'));
  if (!Number.isNaN(left)) meta.remaining = left;
  const j = await r.json();
  const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  if (errs && errs.length) { console.error('API error', path, JSON.stringify(j.errors)); meta.lastError = { at: now, path, errors: j.errors }; return null; }
  return j.response;
}

const fixtures = league?.fixtures || [];
const inWindow = fixtures.some(f => LIVE.has(f.st) || (f.t * 1000 > now - 150 * M && f.t * 1000 < now + 30 * M));
const needFull = !league || inWindow || now - (meta.lastFull || 0) > 3 * H;

let out = league ? { ...league } : { league: { id: LEAGUE, season: SEASON }, teams: {}, fixtures: [], standings: [] };
out.league = { id: LEAGUE, season: SEASON };

if (needFull) {
  const res = await api(`/fixtures?league=${LEAGUE}&season=${SEASON}`);
  if (res) {
    const teams = {};
    const list = res.map(x => {
      for (const side of ['home', 'away']) teams[x.teams[side].id] = { name: x.teams[side].name, logo: x.teams[side].logo };
      return { id: x.fixture.id, t: x.fixture.timestamp, st: x.fixture.status.short, el: x.fixture.status.elapsed,
        r: x.league.round, h: x.teams.home.id, a: x.teams.away.id, gh: x.goals.home, ga: x.goals.away, v: x.fixture.venue?.name || '' };
    }).sort((p, q) => p.t - q.t);
    const finishedNow = list.filter(f => DONE.has(f.st)).length;
    const finishedBefore = fixtures.filter(f => DONE.has(f.st)).length;
    if (finishedNow !== finishedBefore) meta.lastStand = 0; // a match just ended: refresh the table
    out.teams = teams; out.fixtures = list; meta.lastFull = now;
  }
}

if (!out.standings?.length || now - (meta.lastStand || 0) > 6 * H) {
  const res = await api(`/standings?league=${LEAGUE}&season=${SEASON}`);
  if (res && res[0]) {
    out.standings = res[0].league.standings.map(group => group.map(s => ({
      rank: s.rank, team: s.team.id, pts: s.points, gd: s.goalsDiff, form: s.form || '', grp: s.group || '', desc: s.description || '',
      p: s.all.played, w: s.all.win, d: s.all.draw, l: s.all.lose, gf: s.all.goals.for, ga: s.all.goals.against })));
    meta.lastStand = now;
  }
}

// lineups + events: live matches every run, then backfill finished matches newest first
await mkdir(`${DIR}/fx`, { recursive: true });
const liveIds = out.fixtures.filter(f => LIVE.has(f.st)).map(f => f.id);
const missing = out.fixtures.filter(f => DONE.has(f.st) && !existsSync(`${DIR}/fx/${f.id}.json`)).sort((p, q) => q.t - p.t).map(f => f.id);
// the free plan has no "ids" batching: lineups and events cost one request each per match,
// so each run handles live matches first, then backfills at most 2 finished matches
const batch = [...new Set([...liveIds, ...missing.slice(0, 2)])].slice(0, 4);
for (const id of batch) {
  if ((meta.req || 0) + 2 > DAILY_CAP) break;
  const lu = await api(`/fixtures/lineups?fixture=${id}`);
  const ev = await api(`/fixtures/events?fixture=${id}`);
  if (!lu || !ev) continue;
  const d = {
    id,
    ev: ev.map(e => ({ m: e.time.elapsed, x: e.time.extra || 0, team: e.team.id, p: e.player?.name || '', as: e.assist?.name || '', type: e.type, det: e.detail })),
    lu: lu.map(l => ({ team: l.team.id, f: l.formation || '', coach: l.coach?.name || '',
      xi: l.startXI.map(s => ({ n: s.player.number, p: s.player.name, pos: s.player.pos, g: s.player.grid })),
      sub: l.substitutes.map(s => ({ n: s.player.number, p: s.player.name, pos: s.player.pos })) }))
  };
  const file = `${DIR}/fx/${id}.json`, body = JSON.stringify(d);
  const old = existsSync(file) ? await readFile(file, 'utf8') : '';
  if (old !== body) { await writeFile(file, body); changed = true; }
}

out.have = out.fixtures.filter(f => existsSync(`${DIR}/fx/${f.id}.json`)).map(f => f.id);
const body = JSON.stringify(out);
const oldBody = league ? JSON.stringify(league) : '';
if (body !== oldBody) { await writeFile(`${DIR}/league.json`, body); changed = true; }
if (made) { delete meta.sample; meta.fetched = now; await writeFile(`${DIR}/meta.json`, JSON.stringify(meta)); changed = true; }

console.log(JSON.stringify({ made, reqToday: meta.req, remaining: meta.remaining, fixtures: out.fixtures.length, details: out.have.length, changed }));
if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`, { flag: 'a' });
