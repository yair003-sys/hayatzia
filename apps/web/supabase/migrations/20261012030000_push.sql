-- P4: Web Push subscriptions (one row per browser/device that turned notifications on).
-- Fans manage only their own rows. Sending reads other fans' rows on the server with the secret key (service_role).

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) < 1000),
  p256dh      varchar(200) not null,
  auth        varchar(100) not null,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_own_read on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth) on public.push_subscriptions to authenticated;
grant select, delete on public.push_subscriptions to service_role;
