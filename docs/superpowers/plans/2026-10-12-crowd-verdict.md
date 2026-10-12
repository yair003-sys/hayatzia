# Crowd Verdict (דעת הקהל) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live polls inside the match-room chat, opened automatically by chat bursts and match events, voted by every fan, with results overall and per home/away/neutral, testable on a labelled demo match on staging.

**Architecture:** All rules live in Postgres (tables + security-definer triggers/functions + RLS + pgTAP), like the rest of the app. Chat-burst detection runs in the `match_messages` insert path; event polls are opened by trusted callers (demo script now, live poller later) through one service-role RPC. Clients get polls and throttled tallies over the existing private Broadcast channel `match:<fixture_id>` and render them as cards interleaved in `ChatRoom`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Supabase (Postgres, RLS, Realtime Broadcast), next-safe-action 8, Vitest, pgTAP, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-12-crowd-verdict-design.md`

## Global Constraints
- Hebrew UI copy only; RTL.
- Local and production data stay apart: demo fixture, demo fans, demo votes **only on staging**. Scripts refuse the production ref `loaqhisfhafjbrmtygrp`.
- Every demo surface shows "משחק לדוגמה · נתונים לדוגמה".
- Thresholds (one place each, SQL constants): poll open **90 s**; burst **15 distinct fans in 60 s**; cooldown **3 min** per kind per match; **one open poll per match**, except the two minute-60 cards open together; tally broadcast **at most once per second per poll**, plus a final one on close.
- Votes: one per fan per poll (PK), changeable until close; results hidden until the fan votes (or can't vote).
- Counts only from triggers; clients never send counts.
- Every query has an index; migrations: RLS on, `revoke all`, explicit column grants (pattern: `20261011230000_match_rooms.sql`).
- Migrations applied staging first, verified, then production (owner clicks Run on production).
- Sandbox has no npm: verify through CI (`web-ci.yml`, `web-db.yml`); generated `database.types.ts` comes from `web-db.yml`.

## Review Focus
1. A fan spamming "פנדל" 20 times alone must not open a poll (distinct fans only) → test in Task 2.
2. A fan changing their vote must move one count, not add a second → test in Task 1.
3. A vote arriving after `closes_at` (slow phone, stale tab) must be rejected and not change tallies → test in Task 1.
4. A neutral fan voting on a club-only minute-60 card must be refused, yet see results → tests in Task 1 (DB) and Task 3 (`canVote`).
5. Several clients hitting "tick" at once when a poll expires must close it once and post one summary → test in Task 2 (idempotent `crowd_tick`).

---

### Task 1: Poll tables, voting rules, tallies

**Files:**
- Create: `apps/web/supabase/migrations/20261012040000_crowd_verdict.sql`
- Test: `apps/web/supabase/tests/database/crowd_verdict.test.sql`

**Interfaces:**
- Produces (SQL):
  - `fixtures.is_demo boolean not null default false` (ingest never sends it).
  - `match_polls(id uuid pk, fixture_id bigint fk cascade, kind text check in ('penalty','red','offside','var','card','goal','sub60','sub_event','motm'), question varchar(80), options jsonb /* [{id,emoji,label}] */, options_in jsonb null /* bench row, sub60 only */, source text check in ('chat','event','schedule'), voter_scope text null fk teams /* null = everyone */, opens_at timestamptz, closes_at timestamptz, summary text null, last_tally_at timestamptz, created_at)`; index `(fixture_id, opens_at desc)`.
  - `match_poll_votes(poll_id fk cascade, user_id default auth.uid(), option_id text, option_in text null, voter_group char(1) check in ('h','a','n'), updated_at, pk (poll_id,user_id))`.
  - `match_poll_tallies(poll_id, row_kind char(1) check in ('o','i') /* o = main/out row, i = in row */, option_id text, voter_group char(1), n int not null default 0, pk (poll_id,row_kind,option_id,voter_group))`.
  - Grants: authenticated `select` on all three; `insert (poll_id, option_id, option_in)` and `update (option_id, option_in)` on votes; nothing else. service_role: all on the three tables, plus `insert` on `match_messages` (the demo posts as demo fans).
  - Stamp trigger `match_poll_votes_stamp` (before insert/update): poll exists and `now() < closes_at` else `raise 'poll_closed' (P0001)`; `option_id` ∈ options ids and (`kind='sub60'` ⇒ `option_in` ∈ options_in ids, else `option_in` null) else `'bad_option' (22023)`; `voter_scope` set ⇒ fan's `profiles.team_id = voter_scope` else `'not_allowed' (42501)`; fan without profile → `42501`; stamps `voter_group` from `club_of_api(home/away)` (`h`/`a`, otherwise `n`), `user_id` unchanged on update, `updated_at := now()`.
  - Tally trigger `match_poll_votes_tally` (after insert/update): decrement the old (row,option,group) on update, increment the new; same for the `i` row when `option_in` set.
  - RLS: votes select/insert/update own rows only; polls and tallies readable by authenticated; no fan insert on polls.

- [ ] **Step 1: Write the failing pgTAP test** `crowd_verdict.test.sql` with fixtures/profiles set up like `match_rooms.test.sql` (home fan mta, away fan hta, neutral mhf; one live fixture 604 vs 4486). Polls inserted as `postgres` in setup. Assertions:
  - `throws_ok` fan inserting into `match_polls` → `42501`.
  - home fan votes `'yes'` → `voter_group = 'h'`; away → `'a'`; neutral → `'n'`.
  - tally for (`o`,`yes`,`h`) = 1; home fan updates to `'no'` → (`o`,`yes`,`h`) = 0 and (`o`,`no`,`h`) = 1; total votes rows = 1.
  - vote on a poll with `closes_at = now() - interval '1 second'` → `throws_ok ... 'P0001', 'poll_closed'`, tallies unchanged.
  - `option_id = 'nope'` → `'22023'`.
  - sub60 poll scoped `'mta'`: home fan votes `('p7','p14')` → tallies `o/p7/h = 1`, `i/p14/h = 1`; missing `option_in` → `22023`; neutral fan → `42501`; neutral fan can still `select` the tallies (count > 0).
  - fan cannot read another fan's vote row (count 0).

- [ ] **Step 2: Commit the test, push, dispatch `web-db.yml`; expect FAIL** (relation `match_polls` does not exist).

- [ ] **Step 3: Write the migration** to the interfaces above (follow `match_rooms.sql` for trigger style, `security definer set search_path = ''`).

- [ ] **Step 4: Push and dispatch `web-db.yml`; expect all pgTAP green (112 + new).** Read failures via check-run annotations (CLAUDE.md command).

- [ ] **Step 5: Commit** `feat(db): crowd verdict polls, votes and tallies`.

### Task 2: Opening, bursts, queue, closing, broadcasts

**Files:**
- Create: `apps/web/supabase/migrations/20261012041000_crowd_triggers.sql`
- Test: `apps/web/supabase/tests/database/crowd_triggers.test.sql`

**Interfaces:**
- Consumes: Task 1 tables.
- Produces (SQL):
  - `crowd_keyword(body text) returns text` (immutable): normalise (`lower`, trim, collapse 3+ repeated letters to one, strip punctuation), then map: `פנדל|penalty|penalti` → `penalty`; `אדום|red` → `red`; `נבדל|offside` → `offside`; `var|וואר` → `var`; else null. Match as a whole word anywhere in the message.
  - `match_chat_bursts(fixture_id, kind, user_id, at timestamptz, pk (fixture_id,kind,user_id))`, index `(fixture_id, kind, at)`; no fan grants.
  - `match_poll_queue(id bigserial, fixture_id, kind, source, payload jsonb, queued_at)`, index `(fixture_id, queued_at)`; no fan grants.
  - `crowd_open_poll(p_fixture bigint, p_kind text, p_source text, p_question text, p_options jsonb, p_options_in jsonb, p_scope text) returns uuid` (security definer, internal): returns null without opening when cooldown hits (same kind, same fixture, `opens_at > now() - 3 min`, except `sub60` with a different scope); if another non-expired poll is open (any poll for non-sub60; non-sub60 polls for sub60) → `event`/`schedule` sources go to `match_poll_queue`, `chat` is dropped, return null; else insert with `closes_at = now() + 90 s` and `realtime.send(<poll row as json>, 'poll', 'match:' || fixture, true)`.
  - Chat templates (fixed copy from the spec table): `penalty` "פנדל?" ✅ פנדל/❌ לא/🎭 צלילה; `red` "מגיע אדום?" 🟥 אדום/🟨 צהוב מספיק/❌ כלום; `offside` "היה נבדל?" 🚩 נבדל/✅ לא נבדל; `var` "צריך לבדוק ב-VAR?" 📺 כן/❌ לא.
  - After-insert trigger on `match_messages`: `kind := crowd_keyword(body)`; if not null → upsert burst row (`at = now()`), delete that fixture+kind rows older than 2 min, count rows with `at > now() - 60 s`; if ≥ 15 → `crowd_tick(fixture)` then `crowd_open_poll(..., 'chat', template)`.
  - `open_event_poll(p_fixture, p_kind, p_question, p_options, p_options_in, p_scope) returns uuid`: wrapper, `source='event'` (`'schedule'` when kind is `sub60` or `motm`); **execute granted to service_role only**.
  - `crowd_tick(p_fixture bigint) returns void` (security definer, **execute granted to authenticated and service_role**): for each poll with `closes_at <= now() and summary is null` → `update ... set summary = <"61% מהקהל: פנדל"; sub60: "קהל <short>: להוציא את X ולהכניס את Y">  where summary is null` (the `where` makes concurrent ticks idempotent), broadcast `'poll_closed'` with id + summary + final tallies; then drop queue rows older than 3 min and open the oldest remaining one through `crowd_open_poll`.
  - Tally broadcast: in the Task 1 tally trigger path, add a statement in this migration (replace function) that, when `last_tally_at < now() - interval '1 second'`, sets `last_tally_at = now()` and `realtime.send({poll_id, tallies:[{r,o,g,n}]}, 'tally', 'match:'||fixture, true)`.

- [ ] **Step 1: Write the failing pgTAP test** `crowd_triggers.test.sql`. Insert 15 demo-style users/profiles in setup. Assertions:
  - `crowd_keyword('פנדלללל!!!') = 'penalty'`, `crowd_keyword('איזה PENALTY') = 'penalty'`, `crowd_keyword('נבדל ברור') = 'offside'`, `crowd_keyword('יאללה') is null`.
  - 14 distinct fans write "פנדל" → 0 polls; the 15th → 1 poll `kind='penalty'`, `source='chat'`, `closes_at - opens_at = 90 s`.
  - one fan writing "פנדל" 20 times (bypass rate limit by setting `created_at`/using separate statements as postgres with the trigger) → 0 polls.
  - while the penalty poll is open, 15 fans write "אדום" → still 1 open poll (chat dropped); `open_event_poll(..., 'card', ...)` as service_role → returns null and 1 row in `match_poll_queue`.
  - authenticated cannot execute `open_event_poll` (`42501`).
  - expire the poll (`update closes_at = now() - 1s`), call `crowd_tick` twice → `summary` set once and equals `'<n>% מהקהל: פנדל'` form (`like '%מהקהל:%'`); the queued card poll is now open; queue empty.
  - cooldown: after closing, another 15-fan "פנדל" burst within 3 min → no new penalty poll.
  - two `sub60` polls with scopes `mta` and `hta` both open at once.

- [ ] **Step 2: Push, dispatch `web-db.yml`; expect FAIL.**
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Push, dispatch `web-db.yml`; expect green; the bot commits regenerated `database.types.ts`.**
- [ ] **Step 5: Commit** `feat(db): crowd verdict bursts, queue, tick and broadcasts`.

### Task 3: Pure TypeScript (types, results maths, event-poll builders)

**Files:**
- Create: `apps/web/src/features/crowd-verdict/schema.ts`, `schema.test.ts`
- Create: `apps/web/src/features/crowd-verdict/players.ts`, `players.test.ts`

**Interfaces:**
- Consumes: `FixtureDetail` from `features/matches/schema.ts` (lineups have no provider player id: a player key is `"<teamApiId>:<shirt number>"`, or `"<teamApiId>:<name>"` when number is null).
- Produces:
  - `type PollOption = { id: string; emoji: string; label: string }`
  - `type Poll = { id: string; fixtureId: number; kind: PollKind; question: string; options: PollOption[]; optionsIn: PollOption[] | null; source: 'chat'|'event'|'schedule'; scope: string | null; opensAt: string; closesAt: string; summary: string | null }`
  - `type Tally = { row: 'o'|'i'; option: string; group: 'h'|'a'|'n'; n: number }`
  - `type MyVote = { option: string; optionIn: string | null }`
  - `percentages(counts: number[]): number[]`: largest-remainder rounding, sums to 100, all zeros → all zeros.
  - `resultsFor(poll: Poll, tallies: Tally[], row: 'o'|'i', group?: 'h'|'a'|'n'): { option: string; pct: number; n: number }[]`
  - `pollState(poll: Poll, nowMs: number): 'open' | 'closed'`
  - `canVote(poll: Poll, myTeamId: string): boolean` (scope null or equals team, and open)
  - `showResults(poll, myVote, myTeamId, nowMs): boolean`
  - `pollFromRow(row: unknown): Poll | null`, `talliesFromBroadcast(payload: unknown): { pollId: string; tallies: Tally[] } | null` (zod-validated)
  - In `players.ts`: `playerKey(teamApiId: number, p: { n: number | null; p: string }): string`; `hebrewName(p, squad: { number: number | null; name_short: string }[]): string` (by number, else original name); `onPitch(detail: FixtureDetail, teamApiId: number, minute: number): { out: PollOption[]; bench: PollOption[] }` (XI minus subbed-off plus subbed-on by `subst` events up to `minute`); `buildCardPoll(ev, ...)`, `buildGoalPoll(ev, ...)`, `buildSubEventPoll(ev, ...)`, `buildSub60Polls(detail, home, away, squads)`, `buildMotmPoll(detail, squads)`, each returning `{ kind, question, options, optionsIn, scope }` with the spec's Hebrew copy (card for yellow: ✅ מוצדק/❌ לא/🟥 היה אדום; goal: ✅ חוקי/❌ לא; sub event: ✅ נכון/❌ לא; sub60 question "חילוף: מי יוצא ומי נכנס?"; motm "מצטיין המשחק").

- [ ] **Step 1: Write failing Vitest tests:**
  - `percentages([214, 120, 40])` sums to 100 and equals `[57, 32, 11]`; `percentages([1,1,1])` → `[34, 33, 33]`; `percentages([0,0])` → `[0,0]`.
  - `pollState` open at `closesAt - 1 ms`, closed at `closesAt`.
  - `canVote` false for neutral on scope `'mta'`, true for `'mta'` fan; `showResults` true for that neutral even before voting; false for an eligible fan who has not voted while open.
  - `talliesFromBroadcast({})` → null.
  - `onPitch`: XI of 11 + 7 subs, one `subst` event at 55′ → at minute 60 `out` has 11 players including the one who came on and not the one who went off; `bench` has 6 and excludes both.
  - `hebrewName` returns `name_short` when the number matches, original name otherwise.
  - `buildSub60Polls` returns two polls with scopes = home club id and away club id.
- [ ] **Step 2: Push; expect `web-ci.yml` unit step FAIL.**
- [ ] **Step 3: Implement both files.**
- [ ] **Step 4: Push; expect `web-ci.yml` green (typecheck, lint, unit).**
- [ ] **Step 5: Commit** `feat(crowd): poll types, results maths and event poll builders`.

### Task 4: Server queries and actions

**Files:**
- Create: `apps/web/src/features/crowd-verdict/server/queries.ts`, `server/actions.ts`
- Modify: `apps/web/src/features/crowd-verdict/schema.ts` (input schemas)

**Interfaces:**
- Consumes: Task 3 types; `createClient` from `@/lib/supabase/server`; `actionClient` from `@/lib/safe-action`.
- Produces:
  - `getCrowd(fixtureId: number): Promise<{ polls: Poll[]; tallies: Record<string, Tally[]>; mine: Record<string, MyVote> }>`: the last 20 polls of the fixture (index `(fixture_id, opens_at desc)`), their tallies in one `in` query, my votes in one `in` query (no N+1). Never cached (session).
  - `voteAction({ pollId: uuid, option: string(1..40), optionIn?: string(1..40) })` → `{ ok: true } | { error: string }` with Hebrew errors: `poll_closed` → "ההצבעה נסגרה", `not_allowed` → "ההצבעה הזאת רק לאוהדי הקבוצה", `bad_option` → "בחירה לא תקינה". Upsert on `(poll_id,user_id)`.
  - `tickAction({ fixtureId: int })` → calls `rpc('crowd_tick')`.

- [ ] **Step 1: Write failing unit test** for the error mapper `crowdErrorHe(message: string): string` in `schema.test.ts` (three codes above + fallback "ההצבעה לא נקלטה").
- [ ] **Step 2: Push; expect FAIL.**
- [ ] **Step 3: Implement queries, actions, `crowdErrorHe`.**
- [ ] **Step 4: Push; expect `web-ci.yml` green.**
- [ ] **Step 5: Commit** `feat(crowd): queries and vote/tick actions`.

### Task 5: UI in the match room (card, split, pinned strip, demo label)

**Files:**
- Create: `apps/web/src/features/crowd-verdict/components/poll-card.tsx`, `pinned-strip.tsx`, `use-crowd.ts`
- Modify: `apps/web/src/features/chat/components/chat-room.tsx` (two optional props)
- Modify: `apps/web/src/features/match-room/components/match-room.tsx`, `apps/web/src/app/(app)/matches/[id]/page.tsx`, `apps/web/src/app/(app)/matches/page.tsx`
- Modify: `apps/web/src/features/matches/schema.ts`, `features/matches/ingest/rows.ts`, `features/matches/server/queries.ts` (fixture flag `dm?: boolean` from `is_demo`)
- Test: `apps/web/e2e/` existing smoke still green; unit test for `rows.ts` mapping of `is_demo` → `dm`.

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces:
  - `ChatRoomProps.inserts?: { key: string; at: string; node: ReactNode }[]`: rendered interleaved with messages by `at` (ISO), stable by key.
  - `ChatRoomProps.onChannelEvent?: (event: 'poll' | 'tally' | 'poll_closed', payload: unknown) => void`: subscribed on the same channel the room already opens (keep the handler in a ref so the channel is not re-created).
  - `useCrowd(initial, fixtureId, myTeamId)` → `{ polls, tallies, mine, vote(pollId, option, optionIn?), onChannelEvent }`; optimistic own vote, reconciled by the next `tally`/`poll_closed`; when an open poll's countdown hits 0 calls `tickAction` once.
  - `PollCard` matches mockup v3: source pill (⚡ מהצ׳אט / 🟨 אירוע במשחק / ⏱️ דקה 60), countdown, question, one row of pressable emoji buttons with fill bars and % after voting, "N הצביעו · אפשר לשנות", "לפי קבוצה ▾" toggle with home/away/neutral rows (club colours from `DisplayTeam.bar`), sub60 as two chip rows (יוצא / נכנס), closed state shows the summary. Buttons ≥ 44 px tall, `aria-pressed`, respects `prefers-reduced-motion`.
  - `PinnedStrip`: under the match header while an open poll's card is out of view (IntersectionObserver), shows question + per-option % (or "הצבע" before voting); tap scrolls the card into view.
  - Demo label: when `fixture.dm`, a banner "משחק לדוגמה · נתונים לדוגמה" on the match page header and a small tag on the `/matches` list row.
  - Closed polls with `summary` also render the summary line as a centred system line in the stream.

- [ ] **Step 1: Write failing unit test** in `features/matches/ingest/rows.test.ts`: a fixture row with `is_demo: true` maps to `dm: true`; absent → `dm` undefined.
- [ ] **Step 2: Push; expect FAIL.**
- [ ] **Step 3: Implement the flag, components, hook, ChatRoom props, page wiring** (page: `Promise.all([getMatchMessages, getBlockedIds, getCrowd])` inside the existing `MatchRoomSection`).
- [ ] **Step 4: Push; expect `web-ci.yml` fully green (typecheck, lint incl. react-hooks purity/refs rules, unit, build, e2e).**
- [ ] **Step 5: Commit** `feat(crowd): poll cards in the match room`.

### Task 6: Demo match on staging (script, workflow, docs)

**Files:**
- Create: `apps/web/scripts/demo-match.ts`, `.github/workflows/web-demo-match.yml`
- Modify: `docs/ENVIRONMENTS.md` (demo section, scheduled jobs list), `docs/DATA_MODEL.md` (new tables), `docs/ROADMAP.md` (feature status)

**Interfaces:**
- Consumes: `supabaseFromEnv`, `notice` from `scripts/lib/rest.ts`; Task 3 builders (imported with `.ts` paths like `ingest-league.ts`); `open_event_poll`, `crowd_tick` RPCs.
- Produces:
  - `node scripts/demo-match.ts` (Node ≥ 22.18 strips types). Exits 1 if `SUPABASE_URL` contains `loaqhisfhafjbrmtygrp` **or** `DEMO_TARGET !== 'staging'`.
  - Demo fixture id `900000001`, `is_demo = true`, season = the latest season in `fixtures`, Maccabi Tel Aviv (604) vs Hapoel Tel Aviv (4486), `kickoff_at = now() - 55 min`, status `2H`; `fixture_details` lineups built from `players` (same `lu` shape, numbers from the squad). Re-running deletes the old demo fixture first (cascade clears messages/polls/votes).
  - 30 demo fans (auth admin API, emails `demo-fan-NN@demo.hayatzia.test`, nicks `דמו·<name>`, 12 mta, 12 hta, 6 neutral), created once and reused.
  - Timeline (~8 min, then exits): ordinary chat → 18 fans write variants of "פנדל" → poll opens by itself → demo votes trickle (home mostly ✅, away mostly ❌) → at +100 s yellow-card event poll → at +200 s minute-60 (`buildSub60Polls`) → at +320 s goal poll → `crowd_tick` every 5 s throughout. Prints the preview URL path `/matches/900000001` as a notice.
  - Workflow: `workflow_dispatch` only, `environment: staging`, runs the script through `scripts/ci-step.sh` with `DEMO_TARGET=staging`.

- [ ] **Step 1: Implement script + workflow; push; dispatch `web-demo-match.yml`.** Expected: green run, notice lists counts (fans, messages, polls opened ≥ 4, votes).
- [ ] **Step 2: Update the three docs; commit** `feat(crowd): staging demo match` + `docs: crowd verdict`.

### Task 7: Verify and ship

- [ ] **Step 1:** Apply both migrations on **staging** (SQL editor, raw file from the commit), then dispatch `web-db.yml` is already green; confirm tables exist (`select count(*) from match_polls`).
- [ ] **Step 2:** Dispatch `web-demo-match.yml`; open the latest preview deployment `/matches/900000001` signed in on staging; check: banner label visible, penalty poll appears in the chat by itself, voting shows %, "לפי קבוצה" split, pinned strip on scroll, card poll opens after the penalty poll closes, two minute-60 cards, summaries posted. Screenshot for the owner.
- [ ] **Step 3:** Ask the owner to try it on his phone during a demo run.
- [ ] **Step 4:** Production: load both migrations into the production SQL editor; **the owner clicks Run**. Confirm no demo rows exist in production (`select count(*) from fixtures where is_demo` = 0).
- [ ] **Step 5:** Run `web-ci.yml` on `main` green; check production `/matches` still loads. Update `docs/ROADMAP.md`.
