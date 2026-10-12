# Crowd verdict (דעת הקהל) in the match room: design

Status: draft for owner approval, 2026-10-12. Mockup the owner approved ("מה שעשית יפה"): `crowd-verdict-v3.html` (Artifact https://claude.ai/artifact/EhsTPc1YPnyLb8ZsbU1zS5).

## Intent
During a match, fans argue in the match room ("פנדל!", "מגיע אדום!"). The owner wants that argument to turn into a live vote everyone can see: tap an emoji, see right away how the crowd splits, and see it split by club (home fans, away fans, neutral fans). The app should feel in sync with the match: polls open by themselves when the chat erupts or when something happens on the pitch.

Success, in the owner's words: the crowd's opinion "comes to expression" in real time, neatly, with nice, tactile (3D) elements, as part of the chat rather than a separate screen.

## Goals
1. Polls live **inside the match-room chat** as a compact message card (owner: "לא יתפוס מסך שלם… חלק מהצ׳אט"). Not in the team chat, not a separate tab.
2. Polls open **only automatically** (owner): from a burst of chat messages, or from a match event. Fans cannot create polls.
3. **Everyone votes** (owner), including fans of clubs not playing (neutral). Results: overall, plus one row each for home fans, away fans and neutral fans.
4. Live results for everyone in the room, updated as votes come in.
5. Testable now on a **labelled demo match on staging only**. Production gets no test data.

## Non-goals (this round)
- Live match events from the paid API. Season stays 2024 on the free plan, so there are no live fixtures. The owner's later step: once paying, pull events every 5 seconds during matches. The design must leave a clean place for it (see "Event source").
- Polls in the team chat or the Square.
- Fan-created polls, comments on polls, poll history pages.
- Push notifications for polls.

## Anti-goals (would be a failure even if it works)
- A poll that floods the chat or covers it: one open poll at a time, compact card.
- One fan swinging a result: one vote per fan per poll, server-enforced.
- Demo or sample content that is not labelled, or any demo/test row in production.
- Results that can be forged from the browser: counts are computed by the database, never sent by clients.

## Behaviour (decided with the owner)
### Poll types (owner: "מצויין" to this list)
| Trigger | Question | Options |
|---|---|---|
| chat burst "פנדל" | פנדל? | ✅ פנדל · ❌ לא · 🎭 צלילה |
| chat burst "אדום" | מגיע אדום? | 🟥 אדום · 🟨 צהוב מספיק · ❌ כלום |
| chat burst "נבדל" | היה נבדל? | 🚩 נבדל · ✅ לא נבדל |
| chat burst "VAR" | צריך לבדוק ב-VAR? | 📺 כן · ❌ לא |
| event: card | הכרטיס ל<שחקן> מוצדק? | ✅ מוצדק · ❌ לא · 🟥 היה אדום (for yellow) |
| event: goal | הגול חוקי? | ✅ חוקי · ❌ לא |
| minute 60 | חילוף: מי יוצא ומי נכנס? (one card per club) | two rows: players on the pitch (out) and bench (in) of that club |
| event: real substitution | החילוף נכון? | ✅ נכון · ❌ לא |
| full time | מצטיין המשחק | players of both clubs |

Option labels above are the builder's starting wording; Hebrew copy can be tuned later without schema changes.

### Who votes
- All polls: every signed-in fan with a profile may vote, including neutral fans (who can only read the room chat today, and that stays).
- Minute-60 substitution card (owner: "מתאים"): each club gets its own card; only that club's fans vote; each fan picks one player out (from those on the pitch) and one player in (from the bench) in the same card; the whole room sees the result ("קהל מכבי: להוציא את X ולהכניס את Y"). A vote is therefore a pair (out, in); tallies are kept per row (out counts, in counts), not per pair.
- Real substitution event: "החילוף נכון?" for everyone.
- Claude's call: the two minute-60 cards (one per club) open together as one exception to the one-open-poll rule; each fan sees their own club's card as votable and the other as results only. Neutral fans see both as results.
- A fan can change their vote until the poll closes.

### Timing and display (Claude's calls, stated to the owner)
- A poll stays open **90 seconds**, then locks; a closing line is posted in the chat stream ("61% מהקהל: פנדל").
- **One open poll per match.** A trigger that fires while a poll is open waits; if it is still relevant when the open poll closes it opens, otherwise it is dropped. Builder decides the exact rule (e.g. drop chat-burst triggers older than 60 s, queue event triggers).
- **Cooldown:** the same poll kind does not reopen within 3 minutes for the same match.
- Results are hidden until the fan votes (so the split does not steer the vote); after voting, percentages show inside the buttons. Fans who cannot vote (e.g. neutral on a substitution poll) see results immediately.
- Card in the stream: source pill ("⚡ מהצ׳אט" / "🟨 אירוע במשחק"), countdown, question, emoji buttons in one row with fill bars, "N הצביעו", a "לפי קבוצה" toggle that opens the home/away/neutral rows.
- Pinned strip under the score bar while a poll is open and its card is scrolled out of view; tapping scrolls back to the card.
- Look: the v3 mockup: dark match-room style, pressable buttons (bottom shadow that compresses on tap), springy pop-in, respects reduced motion.

### Chat burst detection (Claude's call)
- Keywords per poll kind, matched on normalised message text (trim, lower-case, collapse repeated letters: "פנדללללל" → "פנדל"; Hebrew and simple English variants such as "penalty", "var").
- A burst = at least **15 distinct fans** writing the same kind within **60 seconds** in one match room. One fan counts once. Thresholds are constants in one place so they can be tuned after the first real matches.
- Detection runs in the database (trigger on `match_messages` insert, or a cheap counting step it calls), so it works with no extra server process and costs O(1) per message: keep a small per-match, per-kind rolling table of distinct authors rather than scanning messages.

## How it gets made (Claude's calls)
- **Tables** (new migration, RLS on, explicit grants, pgTAP tests in CI like every other table):
  - `match_polls`: id, fixture_id, kind, question, options (jsonb: id, emoji, label, optional player id), source (`chat` | `event` | `schedule`), voter_scope (`all` | club id), opens_at, closes_at, created_at. Insert only by the database itself (security-definer functions) or service role, never by fans.
  - `match_poll_votes`: poll_id, user_id, option_id (and a second option id for the out/in pair of the minute-60 card), voter_group (`h` | `a` | `n`, stamped by trigger from the fan's club and the fixture), updated_at; primary key (poll_id, user_id). Fans insert/update only their own vote, only while the poll is open, only an option that exists, only if within voter_scope.
  - `match_poll_tallies`: poll_id, option_id, voter_group, count. Maintained by trigger on vote insert/update (counter by trigger, per the standing rule). Readable by signed-in fans.
- **Realtime:** reuse the private Broadcast channel `match:<fixture_id>` already authorised for the room. Broadcast poll opened, tally changed, poll closed. Tally broadcasts must be throttled (at most about one per second per poll) so a thousand votes do not become a thousand messages; builder chooses how (e.g. tally rows updated in place and the client re-reads at most once a second, or a broadcast from a periodic close/flush step).
- **Closing polls:** polls carry `closes_at`; reads treat a poll past `closes_at` as closed, and votes after it are rejected by the trigger. The closing chat line and the queued next poll are produced by whatever runs next (the next message/vote, the 5 s event poller later, or a light scheduled step); builder picks the simplest reliable option and documents it.
- **App:** new feature folder `features/crowd-verdict/` (schema with pure helpers such as keyword normalisation and percentage rounding, unit-tested; server queries/actions via next-safe-action; client card + pinned strip). `MatchRoom` / `ChatRoom` render poll cards interleaved with messages by time. No change to how chat messages are stored.

## Player names in options (Claude's call)
- Source of truth for who is in the match is the provider's lineups (`fixture_details.lineups`, provider player ids), because the live poller will use the same ids later.
- Each option stores the provider player id plus a display name. The display name is the Hebrew name from our `players` table when it can be matched (by club + shirt number, then by name), otherwise the provider's name as is. The matching is one pure, unit-tested helper.
- "On the pitch" vs "bench" is derived from lineups plus substitution events so far (one pure helper, unit-tested).
- The demo fixture seeds lineups in the same provider shape, so the demo exercises the real path.

## Event source
- Interface: one function the rest of the system calls, e.g. `open_event_poll(fixture_id, kind, payload)` in the database. Any event source calls it.
- **Now:** the demo match on staging feeds events from a scripted timeline.
- **Later (owner, when paying):** a poller that reads the live API every 5 seconds during matches, writes `fixture_details.events`, and calls the same function for new events. Not built in this round; nothing here may block it.

## Demo match (staging only)
- A demo fixture in **staging only**, clearly labelled in the UI ("משחק לדוגמה · נתונים לדוגמה") and flagged in data (e.g. `fixtures.is_demo` or a dedicated id range that the ingest never touches).
- A demo run (GitHub workflow, dispatch only, refuses any target but staging, same guard style as `web-load.yml`) that: opens the demo match "now", posts scripted fan messages from a set of labelled demo fans (staging-only seed accounts), produces a chat burst, fires scripted events (yellow card, goal, substitution), and casts demo votes so the owner sees live movement while voting himself from his phone.
- Production: no demo fixture, no demo fans, no demo votes. The migration itself (tables, functions) is applied to production as usual after staging is verified; it is inert there until real live matches exist.

## Constraints
- Standing rules in `CLAUDE.md`: Hebrew UI, staging before production, owner clicks production SQL, indexes for every query, counters by trigger, no N+1, keyset pagination where lists grow.
- The free (nano) staging database: the demo must stay small (dozens of demo fans, not thousands).
- Next.js 16 conventions in `docs/CONVENTIONS.md`; lint rules on purity/refs/effects apply.

## Left to the builder
- Exact keyword lists and Hebrew copy per option (starting points above).
- How the queue/cooldown is stored, and the exact closing mechanism.
- Throttling strategy for tally updates.
- Demo seed shape and timeline script.
- Component breakdown and tests, within the existing patterns (`features/chat`, `features/match-room`).
