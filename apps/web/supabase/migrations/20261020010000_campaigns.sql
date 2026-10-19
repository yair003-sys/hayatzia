-- Fan campaigns (the business heart): fans open a campaign for a concrete goal (a tifo, a banner, a gift, a youth
-- team's kit), other fans back it, and when it succeeds the money goes to the beneficiary while onefan takes a small
-- fee. CRITICAL PRINCIPLE: onefan is NEVER custodial. The licensed payment provider holds and splits the money
-- straight to the beneficiary; here we keep only a readable record — no money at rest, no card data ever. This
-- migration is the data model only; it carries no real money and is exercised by a mock adapter in dev/CI. Money is
-- in agorot (bigint) — integers only, never floats.

-- ---------- campaigns ----------
create table public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  organizer_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id             text references public.teams (id) on delete set null,     -- the club it rallies, or null (league-wide)
  fixture_id          bigint,                                                    -- optional: tie to a match (soft ref to fixtures)
  title               text not null check (char_length(title) between 3 and 90),
  description         text not null default '' check (char_length(description) <= 4000),
  category            text not null check (category in ('tifo','banner','gift','youth','charity','community','other')),
  image_path          text,                                                      -- Storage key; never a hotlink
  goal_agorot         bigint not null check (goal_agorot between 100 and 100000000),  -- ₪1 .. ₪1,000,000
  currency            text not null default 'ILS' check (currency = 'ILS'),
  funding_model       text not null default 'all_or_nothing' check (funding_model in ('all_or_nothing','flexible')),
  -- Who receives the money. Whether an 'amuta' (registered non-profit) is REQUIRED is a launch policy decided in the
  -- app, not the schema — so the owner can choose "amuta always" or "tiered" without a migration.
  beneficiary_kind    text not null check (beneficiary_kind in ('individual','business','amuta')),
  beneficiary_name    text not null check (char_length(beneficiary_name) between 2 and 120),
  beneficiary_verified boolean not null default false,                           -- set true once the payout account is verified
  status              text not null default 'draft'
                        check (status in ('draft','pending_review','live','funded','failed','paid_out','cancelled')),
  deadline            timestamptz not null,
  raised_agorot       bigint not null default 0,                                 -- counter (active pledges), by trigger
  supporters_count    integer not null default 0,                               -- counter (distinct active backers), by trigger
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Discovery (live campaigns by soonest deadline), a club's campaigns, and an organizer's own list.
create index campaigns_live_idx on public.campaigns (status, deadline) where status in ('live','funded','paid_out','failed');
create index campaigns_team_idx on public.campaigns (team_id, status);
create index campaigns_organizer_idx on public.campaigns (organizer_id);

alter table public.campaigns enable row level security;

-- Anyone may see a campaign once it is public (live or finished); drafts and in-review stay with the organizer/admin.
create policy campaigns_public_read on public.campaigns for select to anon, authenticated
  using (status in ('live','funded','paid_out','failed'));
create policy campaigns_owner_read on public.campaigns for select to authenticated
  using (organizer_id = (select auth.uid()) or public.is_app_admin());
-- An organizer opens their own campaign; it starts life as a draft or goes straight to review — never self-published live.
create policy campaigns_owner_insert on public.campaigns for insert to authenticated
  with check (organizer_id = (select auth.uid()) and status in ('draft','pending_review'));
-- The organizer edits their own campaign; admins may act on any (review, verify, cancel). A status trigger (below)
-- keeps an organizer from publishing or marking their own campaign funded/paid.
create policy campaigns_owner_update on public.campaigns for update to authenticated
  using (organizer_id = (select auth.uid()) or public.is_app_admin())
  with check (organizer_id = (select auth.uid()) or public.is_app_admin());

revoke all on public.campaigns from anon, authenticated;
grant select on public.campaigns to anon, authenticated;
grant insert, update on public.campaigns to authenticated;
grant all on public.campaigns to service_role;

-- Guard the sensitive state changes. A non-admin may move a campaign only draft→pending_review (submit) or
-- →cancelled (withdraw); going live, funded, failed or paid_out is the platform's call (admin or the server via
-- service_role, which bypasses RLS and this trigger does not block it since it only guards non-admin app users).
create function public.guard_campaign_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Guard ordinary logged-in fans only. The server (service_role) and admins publish/verify/settle and are trusted;
  -- the migration/test superuser (auth.role() is null) is also exempt so it can set up state.
  if new.status is distinct from old.status
     and (select auth.role()) = 'authenticated' and not public.is_app_admin() then
    if not (
      (old.status = 'draft'          and new.status in ('pending_review','cancelled')) or
      (old.status = 'pending_review' and new.status in ('draft','cancelled'))
    ) then
      raise exception 'campaign status change % -> % is not allowed', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.guard_campaign_status() from public, anon, authenticated;
create trigger campaigns_guard_status before update on public.campaigns
  for each row execute function public.guard_campaign_status();

-- ---------- contributions (a backing record — NOT money we hold) ----------
-- A contribution points at the provider's hold/charge by an opaque reference. We never store card data. Status
-- mirrors the provider: held (authorised), captured (charged on success), released (hold dropped — goal missed),
-- refunded, or failed.
create table public.campaign_contributions (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount_agorot  bigint not null check (amount_agorot between 100 and 100000000),  -- ₪1 .. ₪1,000,000
  status         text not null default 'held' check (status in ('held','captured','released','refunded','failed')),
  provider       text not null default 'mock',                                    -- which payment adapter
  provider_ref   text,                                                            -- opaque token from the provider; never card data
  anonymous      boolean not null default false,                                  -- hide the backer's name in public lists
  created_at     timestamptz not null default now()
);

create index contributions_campaign_idx on public.campaign_contributions (campaign_id, status);
create index contributions_user_idx on public.campaign_contributions (user_id);
create index contributions_campaign_user_idx on public.campaign_contributions (campaign_id, user_id);

alter table public.campaign_contributions enable row level security;

-- A backer sees their own contributions; the campaign's organizer sees the ones to their campaign (for the backers
-- list and management); admins see all. The public never reads raw contributions — only the counters on the campaign.
create policy contributions_own_read on public.campaign_contributions for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_app_admin()
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.organizer_id = (select auth.uid()))
  );
-- A fan backs only as themselves, only a live campaign; the hold starts as 'held'. State changes afterwards come from
-- the server (service_role), never the client.
create policy contributions_own_insert on public.campaign_contributions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'held'
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status = 'live')
  );

revoke all on public.campaign_contributions from anon, authenticated;
grant select, insert on public.campaign_contributions to authenticated;
grant all on public.campaign_contributions to service_role;

-- Keep the campaign's counters in step with its contributions, incrementally (no re-scan per write). "Active" = a
-- pledge still standing (held or captured). raised_agorot sums active pledges; supporters_count is distinct active
-- backers, so a fan backing twice still counts once.
create function public.sync_campaign_counters() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_active boolean := tg_op <> 'INSERT' and old.status in ('held','captured');
  is_active  boolean := tg_op <> 'DELETE' and new.status in ('held','captured');
  d_raised   bigint := 0;
  d_people   integer := 0;
  v_campaign uuid := case tg_op when 'DELETE' then old.campaign_id else new.campaign_id end;
  v_user     uuid := case tg_op when 'DELETE' then old.user_id else new.user_id end;
begin
  d_raised := (case when is_active then new.amount_agorot else 0 end)
            - (case when was_active then old.amount_agorot else 0 end);

  if is_active and not was_active then
    -- became active: a new distinct backer only if they had no other active pledge here
    if not exists (
      select 1 from public.campaign_contributions c
      where c.campaign_id = v_campaign and c.user_id = v_user and c.status in ('held','captured')
        and c.id <> new.id
    ) then
      d_people := 1;
    end if;
  elsif was_active and not is_active then
    -- stopped being active: lose a distinct backer only if they have no remaining active pledge here
    if not exists (
      select 1 from public.campaign_contributions c
      where c.campaign_id = v_campaign and c.user_id = v_user and c.status in ('held','captured')
        and c.id <> old.id
    ) then
      d_people := -1;
    end if;
  end if;

  if d_raised <> 0 or d_people <> 0 then
    update public.campaigns
       set raised_agorot = raised_agorot + d_raised,
           supporters_count = supporters_count + d_people
     where id = v_campaign;
  end if;
  return null;
end $$;

revoke all on function public.sync_campaign_counters() from public, anon, authenticated;
create trigger contributions_sync_counters
  after insert or update of status, amount_agorot or delete on public.campaign_contributions
  for each row execute function public.sync_campaign_counters();
