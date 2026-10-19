-- Fan campaigns: the counters stay right as pledges come and go (a backer who pledges twice still counts once),
-- RLS hides drafts and other fans' contributions, and an ordinary fan can neither self-publish a campaign nor back
-- one that isn't live. No real money is involved — statuses mirror a mock provider.
begin;
select plan(15);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'org@test.local'),  -- organizer
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'b1@test.local'),   -- backer 1
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b2@test.local'),   -- backer 2
  ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'f1@test.local');   -- stranger
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'מארגן', 'mta'),
  ('00000000-0000-0000-0000-0000000000b1', 'תומך1', 'mta'),
  ('00000000-0000-0000-0000-0000000000b2', 'תומך2', 'mta'),
  ('00000000-0000-0000-0000-0000000000f1', 'זר', 'mta');

-- A live campaign and a draft campaign by the same organizer.
insert into public.campaigns (id, organizer_id, team_id, title, category, goal_agorot, beneficiary_kind, beneficiary_name, status, deadline) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000c1', 'mta', 'טיפו לדרבי', 'tifo', 2000000, 'amuta', 'עמותת אוהדים', 'live',  now() + interval '5 days'),
  ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-0000000000c1', 'mta', 'טיוטה',      'other', 500000, 'individual', 'יאיר', 'draft', now() + interval '7 days');

-- Two backers hold a pledge on the live campaign.
insert into public.campaign_contributions (id, campaign_id, user_id, amount_agorot, status) values
  ('00000000-0000-0000-0000-00000000cb01', '00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000b1', 5000, 'held'),
  ('00000000-0000-0000-0000-00000000cb02', '00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000b2', 3000, 'held');

select is((select raised_agorot from public.campaigns where id = '00000000-0000-0000-0000-00000000ca01'), 8000::bigint, 'two holds → raised = 8000');
select is((select supporters_count from public.campaigns where id = '00000000-0000-0000-0000-00000000ca01'), 2, 'two distinct backers → supporters = 2');

-- The same backer pledges again: raised grows, but they are still one supporter.
insert into public.campaign_contributions (id, campaign_id, user_id, amount_agorot, status) values
  ('00000000-0000-0000-0000-00000000cb03', '00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000b1', 2000, 'held');
select is((select raised_agorot from public.campaigns where id = '00000000-0000-0000-0000-00000000ca01'), 10000::bigint, 'same backer again → raised = 10000');
select is((select supporters_count from public.campaigns where id = '00000000-0000-0000-0000-00000000ca01'), 2, 'same backer again → still 2 supporters');

-- Release that second pledge: raised drops, backer still counts (they have another active pledge).
update public.campaign_contributions set status = 'released' where id = '00000000-0000-0000-0000-00000000cb03';
select is((select raised_agorot from public.campaigns where id = '00000000-0000-0000-0000-00000000ca01'), 8000::bigint, 'release one of a backer''s pledges → raised = 8000');
select is((select supporters_count from public.campaigns where id = '00000000-0000-0000-0000-00000000ca01'), 2, 'backer still has an active pledge → still 2 supporters');

-- Release the other backer's only pledge: raised drops and they stop counting.
update public.campaign_contributions set status = 'released' where id = '00000000-0000-0000-0000-00000000cb02';
select is((select raised_agorot from public.campaigns where id = '00000000-0000-0000-0000-00000000ca01'), 5000::bigint, 'release backer 2''s only pledge → raised = 5000');
select is((select supporters_count from public.campaigns where id = '00000000-0000-0000-0000-00000000ca01'), 1, 'backer 2 gone → supporters = 1');

-- RLS: a stranger sees the live campaign but not the draft.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);
select is((select count(*)::int from public.campaigns where id = '00000000-0000-0000-0000-00000000ca01'), 1, 'a stranger sees the live campaign');
select is((select count(*)::int from public.campaigns where id = '00000000-0000-0000-0000-00000000ca02'), 0, 'a stranger does not see the draft');
-- A fan cannot back a campaign that is not live (insert policy).
select throws_ok(
  $$insert into public.campaign_contributions (campaign_id, user_id, amount_agorot, status)
    values ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-0000000000f1', 1000, 'held')$$,
  '42501', null, 'a fan cannot back a draft campaign (RLS)');
-- A stranger cannot read another backer's contributions.
select is((select count(*)::int from public.campaign_contributions where user_id = '00000000-0000-0000-0000-0000000000b1'), 0, 'a stranger reads none of another fan''s contributions');

-- The organizer sees their own draft, and their backers' contributions.
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c1','role','authenticated')::text, true);
select is((select count(*)::int from public.campaigns where id = '00000000-0000-0000-0000-00000000ca02'), 1, 'the organizer sees their own draft');
-- An ordinary fan cannot self-publish their campaign to live (status guard).
select throws_ok(
  $$update public.campaigns set status = 'live' where id = '00000000-0000-0000-0000-00000000ca02'$$,
  '23514', null, 'an organizer cannot move their own draft straight to live');

-- The backer sees their own contributions (both of them).
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000b1','role','authenticated')::text, true);
select is((select count(*)::int from public.campaign_contributions where user_id = '00000000-0000-0000-0000-0000000000b1'), 2, 'a backer sees their own two contributions');
reset role;

select * from finish();
rollback;
