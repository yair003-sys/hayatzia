-- Stand home ("היציע שלי"): real numbers for the hero card and the match-day ticket.
-- 1. Verified fans per club: a counter kept by trigger (no count(*) per page view).
-- 2. Realtime Presence on dedicated private topics, so they never clash with the broadcast channels:
--    online:<club>  — fans of that club with the app open ("מחוברים עכשיו")
--    room:<fixture> — fans in a match room right now ("X אוהדים בחדר"); rooms are readable by every fan.

create table public.team_stats (
  team_id text primary key references public.teams (id) on delete cascade,
  fans    integer not null default 0 check (fans >= 0)
);

insert into public.team_stats (team_id, fans)
  select t.id, (select count(*) from public.profiles p where p.team_id = t.id) from public.teams t
on conflict (team_id) do update set fans = excluded.fans;

create function public.team_stats_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.team_stats as s (team_id, fans) values (new.team_id, 1)
      on conflict (team_id) do update set fans = s.fans + 1;
  elsif tg_op = 'DELETE' then
    update public.team_stats set fans = greatest(fans - 1, 0) where team_id = old.team_id;
  end if;
  return null;
end $$;
create trigger profiles_team_stats after insert or delete on public.profiles
  for each row execute function public.team_stats_count();

alter table public.team_stats enable row level security;
create policy team_stats_own_club on public.team_stats for select to authenticated
  using (team_id = (select public.my_team()));
revoke all on public.team_stats from anon, authenticated;
grant select on public.team_stats to authenticated;
grant all on public.team_stats to service_role;

create policy presence_receive on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'presence'
         and (realtime.topic() = 'online:' || (select public.my_team()) or realtime.topic() like 'room:%'));
create policy presence_track on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence'
              and (realtime.topic() = 'online:' || (select public.my_team()) or realtime.topic() like 'room:%'));
