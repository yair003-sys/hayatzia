-- Neighborhood War / Territory (owner 2026-11-14): fans capture hex cells (H3) by physically being there; a cell takes
-- the colour of its holder's club. The hex id is computed server-side from the device's coordinates (H3, resolution 8),
-- so there is no polygon store and no PostGIS. All capture logic — accuracy gate, one-hour cooldown, teleport check —
-- runs in a trusted Server Action that writes with the service role; this is why `territory` is READ-ONLY to clients
-- (select only, no insert/update/delete policy), so a fan can never paint a cell without passing the checks.

-- Current holder of each hex cell.
create table public.territory (
  h3          text primary key,
  team_id     text not null,
  user_id     uuid not null references public.profiles (user_id) on delete cascade,
  nick        text not null,
  captured_at timestamptz not null default now()
);
create index territory_team_idx on public.territory (team_id);

alter table public.territory enable row level security;
-- Everyone signed in sees the whole map; nobody writes directly (only the service role, through the capture action).
create policy territory_read on public.territory for select to authenticated using (true);
grant select on public.territory to authenticated;

-- The map updates live as cells change hands.
alter publication supabase_realtime add table public.territory;

-- Append-only log of every capture: powers the teleport check now and leaderboards later. Closed to clients entirely —
-- only the service role reads and writes it.
create table public.territory_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (user_id) on delete cascade,
  h3          text not null,
  lat         double precision not null,
  lng         double precision not null,
  captured_at timestamptz not null default now()
);
create index territory_log_user_idx on public.territory_log (user_id, captured_at desc);
alter table public.territory_log enable row level security;
-- No policies and no grants: authenticated clients can neither read nor write it; the service role bypasses RLS.
