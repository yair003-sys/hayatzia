-- Fan lineup ("ההרכב של האוהדים", 2026-10-14): before kick-off each fan builds the XI they want for their own
-- club's match; everyone sees the fans' most-wanted XI.
-- A lineup is written only through save_fan_lineup / clear_fan_lineup (never directly by clients) and is checked by
-- the stamp trigger on every write: own club's match, before kick-off and not started, 11 different players of the
-- fan's club (not the coach), slots 0..10 once each, a known formation. Counts move by trigger into
-- fan_lineup_tallies (picks per formation/slot/player) and fan_lineup_totals (fans + per-formation fans); both hold
-- counts only, never fan ids.

create table public.fan_lineups (
  fixture_id  bigint not null references public.fixtures (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id     text not null default public.my_team() references public.teams (id),  -- stamped: the fan's club
  formation   text not null check (formation in ('4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2')),
  slots       jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) = 11),
                                                                            -- [{slot 0..10, player_id}] in slot order
  updated_at  timestamptz not null default now(),
  primary key (fixture_id, user_id)
);
create index fan_lineups_user_idx on public.fan_lineups (user_id, fixture_id);  -- own lineups; account delete

-- Picks per (match, club, formation, slot, player). Rows at zero are removed. No foreign key to players: a player
-- leaving the squad keeps the history readable (the UI skips unknown ids).
create table public.fan_lineup_tallies (
  fixture_id  bigint not null references public.fixtures (id) on delete cascade,
  team_id     text not null references public.teams (id),
  formation   text not null,
  slot        smallint not null check (slot between 0 and 10),
  player_id   text not null,
  picks       integer not null check (picks > 0),
  primary key (fixture_id, team_id, formation, slot, player_id)
);

-- One row per (match, club): fans who saved a lineup, and how many chose each formation ({"4-3-3": 12, ...}).
-- Also the lock that makes a club's counts move one save at a time (no lost updates, no deadlocks).
create table public.fan_lineup_totals (
  fixture_id  bigint not null references public.fixtures (id) on delete cascade,
  team_id     text not null references public.teams (id),
  fans        integer not null default 0 check (fans >= 0),
  formations  jsonb not null default '{}' check (jsonb_typeof(formations) = 'object'),
  primary key (fixture_id, team_id)
);

-- ---------- every write is checked and stamped ----------
create function public.fan_lineups_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan   text;
  f     record;
  n_slot integer;
  n_slot_distinct integer;
  n_player integer;
  n_player_distinct integer;
  n_mine integer;
  norm  jsonb;
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.fixture_id := old.fixture_id;
  end if;
  select p.team_id into fan from public.profiles p where p.user_id = new.user_id;
  if fan is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  select fx.kickoff_at, fx.status, public.club_of_api(fx.home_api_id) as home, public.club_of_api(fx.away_api_id) as away
    into f from public.fixtures fx where fx.id = new.fixture_id;
  if not found then
    raise exception 'no such match' using errcode = '23503';
  end if;
  if fan is distinct from f.home and fan is distinct from f.away then
    raise exception 'not_your_match' using errcode = '42501';
  end if;
  if now() >= f.kickoff_at or f.status not in ('NS', 'TBD') then
    raise exception 'locked' using errcode = 'P0001';
  end if;
  if new.formation is null or new.formation not in ('4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2') then
    raise exception 'bad_formation' using errcode = '22023';
  end if;
  if new.slots is null or jsonb_typeof(new.slots) <> 'array' or jsonb_array_length(new.slots) <> 11 then
    raise exception 'bad_slots' using errcode = '22023';
  end if;

  with e as (
    select
      case when jsonb_typeof(x -> 'slot') = 'number' and (x ->> 'slot') ~ '^(10|[0-9])$' then (x ->> 'slot')::smallint end as s,
      case when jsonb_typeof(x -> 'player_id') = 'string' then x ->> 'player_id' end as pid
    from jsonb_array_elements(new.slots) x
  )
  select count(s), count(distinct s), count(pid), count(distinct pid),
         (select count(*)::int from public.players pl
           where pl.team_id = fan and pl.position <> 'מאמן' and pl.id in (select e2.pid from e e2)),
         jsonb_agg(jsonb_build_object('slot', s, 'player_id', pid) order by s)
    into n_slot, n_slot_distinct, n_player, n_player_distinct, n_mine, norm
    from e;
  if n_slot <> 11 or n_slot_distinct <> 11 then
    raise exception 'bad_slots' using errcode = '22023';
  end if;
  if n_player <> 11 or n_player_distinct <> 11 then
    raise exception 'bad_players' using errcode = '22023';
  end if;
  if n_mine <> 11 then
    raise exception 'not_your_player' using errcode = '42501';
  end if;

  new.team_id := fan;
  new.slots := norm;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.fan_lineups_stamp() from public, anon, authenticated;
create trigger fan_lineups_stamp before insert or update on public.fan_lineups
  for each row execute function public.fan_lineups_stamp();

-- ---------- counts ----------
-- Old XI out (-1 per slot), new XI in (+1), netted so an unchanged slot is not touched. Every change first locks the
-- club's totals row, so concurrent saves for one club apply one after the other.
create function public.fan_lineups_tally() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_fixture  bigint;
  v_team     text;
  old_f      text;
  old_s      jsonb;
  new_f      text;
  new_s      jsonb;
  forms      jsonb;
  r          record;
begin
  if tg_op <> 'INSERT' then
    v_fixture := old.fixture_id; v_team := old.team_id; old_f := old.formation; old_s := old.slots;
  end if;
  if tg_op <> 'DELETE' then
    v_fixture := new.fixture_id; v_team := new.team_id; new_f := new.formation; new_s := new.slots;
  end if;
  if tg_op = 'UPDATE' and new_f = old_f and new_s = old_s then
    return null;
  end if;

  if new_f is not null then
    insert into public.fan_lineup_totals (fixture_id, team_id) values (v_fixture, v_team) on conflict do nothing;
  end if;
  select t.formations into forms from public.fan_lineup_totals t
    where t.fixture_id = v_fixture and t.team_id = v_team for update;
  if not found then
    return null;  -- the match itself is being deleted: its counts go with it
  end if;

  for r in
    select d.formation, d.slot, d.player_id, sum(d.delta)::int as delta from (
      select old_f as formation, (x ->> 'slot')::smallint as slot, x ->> 'player_id' as player_id, -1 as delta
        from jsonb_array_elements(old_s) x
      union all
      select new_f, (x ->> 'slot')::smallint, x ->> 'player_id', 1
        from jsonb_array_elements(new_s) x
    ) d
    group by d.formation, d.slot, d.player_id
    having sum(d.delta) <> 0
    order by d.formation, d.slot, d.player_id
  loop
    if r.delta > 0 then
      insert into public.fan_lineup_tallies as t (fixture_id, team_id, formation, slot, player_id, picks)
      values (v_fixture, v_team, r.formation, r.slot, r.player_id, r.delta)
      on conflict (fixture_id, team_id, formation, slot, player_id) do update set picks = t.picks + excluded.picks;
    else
      delete from public.fan_lineup_tallies t
        where t.fixture_id = v_fixture and t.team_id = v_team and t.formation = r.formation and t.slot = r.slot
          and t.player_id = r.player_id and t.picks + r.delta <= 0;
      update public.fan_lineup_tallies t set picks = t.picks + r.delta
        where t.fixture_id = v_fixture and t.team_id = v_team and t.formation = r.formation and t.slot = r.slot
          and t.player_id = r.player_id;
    end if;
  end loop;

  if old_f is not null then
    forms := case when coalesce((forms ->> old_f)::int, 0) <= 1 then forms - old_f
                  else jsonb_set(forms, array[old_f], to_jsonb((forms ->> old_f)::int - 1)) end;
  end if;
  if new_f is not null then
    forms := jsonb_set(forms, array[new_f], to_jsonb(coalesce((forms ->> new_f)::int, 0) + 1));
  end if;
  update public.fan_lineup_totals t set
    fans = greatest(t.fans + (new_f is not null)::int - (old_f is not null)::int, 0),
    formations = forms
  where t.fixture_id = v_fixture and t.team_id = v_team;
  return null;
end $$;
revoke all on function public.fan_lineups_tally() from public, anon, authenticated;
create trigger fan_lineups_tally after insert or update or delete on public.fan_lineups
  for each row execute function public.fan_lineups_tally();

-- ---------- RPCs (the only way fans write) ----------
-- Save (insert or replace) the caller's XI for a match. p_slots: [{slot: 0..10, player_id}] × 11, any order.
-- Errors: 42501 'no profile' / 'not_your_match' / 'not_your_player', P0001 'locked', 22023 'bad_formation' /
-- 'bad_slots' / 'bad_players', 23503 'no such match'.
create function public.save_fan_lineup(p_fixture bigint, p_formation text, p_slots jsonb) returns public.fan_lineups
language plpgsql security definer set search_path = '' as $$
declare
  me  uuid := auth.uid();
  row public.fan_lineups;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.fan_lineups as l (fixture_id, user_id, formation, slots)
  values (p_fixture, me, p_formation, p_slots)
  on conflict (fixture_id, user_id) do update set formation = excluded.formation, slots = excluded.slots
  returning * into row;
  return row;
end $$;
revoke all on function public.save_fan_lineup(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_fan_lineup(bigint, text, jsonb) to authenticated;

-- Remove the caller's XI before kick-off. true when there was one.
create function public.clear_fan_lineup(p_fixture bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  f  record;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select fx.kickoff_at, fx.status into f from public.fixtures fx where fx.id = p_fixture;
  if not found then
    return false;
  end if;
  if now() >= f.kickoff_at or f.status not in ('NS', 'TBD') then
    raise exception 'locked' using errcode = 'P0001';
  end if;
  delete from public.fan_lineups where fixture_id = p_fixture and user_id = me;
  return found;
end $$;
revoke all on function public.clear_fan_lineup(bigint) from public, anon, authenticated;
grant execute on function public.clear_fan_lineup(bigint) to authenticated;

-- ---------- row level security ----------
alter table public.fan_lineups        enable row level security;
alter table public.fan_lineup_tallies enable row level security;
alter table public.fan_lineup_totals  enable row level security;

create policy fan_lineups_own_read on public.fan_lineups for select to authenticated using (user_id = (select auth.uid()));
-- Counts only (no fan ids): any signed-in fan of the league.
create policy fan_lineup_tallies_read on public.fan_lineup_tallies for select to authenticated using (true);
create policy fan_lineup_totals_read  on public.fan_lineup_totals  for select to authenticated using (true);

revoke all on public.fan_lineups, public.fan_lineup_tallies, public.fan_lineup_totals from anon, authenticated;
grant select on public.fan_lineups, public.fan_lineup_tallies, public.fan_lineup_totals to authenticated;
grant all on public.fan_lineups to service_role;
grant select on public.fan_lineup_tallies, public.fan_lineup_totals to service_role;
