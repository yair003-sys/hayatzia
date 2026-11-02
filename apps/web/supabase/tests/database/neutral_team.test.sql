-- Neutral staff affiliation (migration 20261102130000_neutral_team): the 'onefan' team exists with no api names, and a
-- profile can live on it (so an operator's account has a valid, neutral team).
begin;
select plan(3);

select is((select name from public.teams where id = 'onf'), 'onefan', 'the neutral team exists');
select ok((select api_names from public.teams where id = 'onf') = array[]::text[], 'the neutral team has no api names (never matches a fixture)');

insert into auth.users (id, aud, role, email)
  values ('00000000-0000-0000-0000-0000000000ff', 'authenticated', 'authenticated', 'ff@test.local');
insert into public.profiles (user_id, nick, team_id)
  values ('00000000-0000-0000-0000-0000000000ff', 'onefan', 'onf');
select is((select team_id from public.profiles where user_id = '00000000-0000-0000-0000-0000000000ff'), 'onefan',
          'a profile can live on the neutral team');

select * from finish();
rollback;
