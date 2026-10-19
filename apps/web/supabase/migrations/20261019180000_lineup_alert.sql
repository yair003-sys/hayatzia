-- Phase 5 (algorithm): a push + in-app banner the moment a match's official line-ups are published
-- ("📋 ההרכבים פורסמו · כנס לצ'אט"). Line-ups are written to fixture_details.lineups by the fuller 10-minute
-- pipeline (never by the live tick, which writes events only), so the alert is queued by a trigger on
-- fixture_details — distinct from the goal/full-time trigger on fixtures. It reuses the whole existing alert
-- pipeline: match_alerts row, the 'alerts' realtime broadcast, alert_recipients (respects each fan's matches
-- preference), claim/dispatch and the same per-match notification tag.

-- 1) Allow the new alert kind. The old inline check admitted only 'goal' and 'ft'.
alter table public.match_alerts drop constraint match_alerts_kind_check;
alter table public.match_alerts add constraint match_alerts_kind_check check (kind in ('goal', 'ft', 'lineup'));

-- 2) The trigger function: fire once when a fixture's line-ups go from empty to published, and only for a match that
-- is actually about to be played (so a back-fill of an old match's line-ups never pushes retroactively). Dedup is the
-- existing unique (fixture_id, kind, home_goals, away_goals): one 'lineup' row per match (goals 0:0, no scorer).
create or replace function public.fixture_lineup_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  f public.fixtures;
  a public.match_alerts;
begin
  -- Only the empty -> non-empty transition. An insert has no OLD row (TG_OP = 'INSERT').
  if jsonb_array_length(coalesce(new.lineups, '[]'::jsonb)) = 0 then
    return null;
  end if;
  if tg_op = 'UPDATE' and jsonb_array_length(coalesce(old.lineups, '[]'::jsonb)) > 0 then
    return null;
  end if;

  select * into f from public.fixtures where id = new.fixture_id;
  if not found then
    return null;
  end if;
  -- Not for a finished match, and only around kick-off (line-ups land ~1h before): never a retroactive back-fill.
  if f.status in ('FT', 'AET', 'PEN', 'AWD', 'WO') then
    return null;
  end if;
  if f.kickoff_at < now() - interval '30 minutes' or f.kickoff_at > now() + interval '6 hours' then
    return null;
  end if;

  insert into public.match_alerts (fixture_id, kind, home_goals, away_goals, scoring_api_id)
    values (new.fixture_id, 'lineup', 0, 0, null)
    on conflict (fixture_id, kind, home_goals, away_goals) do nothing
    returning * into a;
  if a.id is not null then
    perform realtime.send(jsonb_build_object('id', a.id, 'fixture_id', a.fixture_id, 'kind', a.kind,
      'home_goals', a.home_goals, 'away_goals', a.away_goals, 'scoring_api_id', a.scoring_api_id), 'alert', 'alerts', true);
  end if;
  return null;
end $$;

revoke all on function public.fixture_lineup_alert() from public, anon, authenticated;

create trigger fixture_lineup_alert after insert or update of lineups on public.fixture_details
  for each row execute function public.fixture_lineup_alert();
