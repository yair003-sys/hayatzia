-- Vendor Direct Payment Model (owner, 2026-10-28): a campaign funds a concrete goal supplied by a real, verified
-- VENDOR (a print shop, a tifo maker). When the goal is met, the licensed processor releases the money straight to
-- the vendor against a tax invoice — never to a person, never to an onefan "super-account". onefan stays
-- non-custodial and keeps only records. This migration adds the vendor roster, ties a campaign to a vendor, and
-- records each payout against its invoice. Money is in minor units; no card data; invoices live in private Storage.

-- ---------- vendor roster ----------
create table public.campaign_vendors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 120),
  business_id  text not null check (char_length(business_id) between 5 and 20),   -- ח"פ / עוסק מורשה
  category     text not null check (category in ('print','pyro','apparel','media','other')),
  payout_ref   text,                                                              -- opaque sub-merchant/connected-account id at the processor; never bank numbers
  status       text not null default 'pending' check (status in ('pending','approved','suspended')),
  contact      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index campaign_vendors_status_idx on public.campaign_vendors (status);

alter table public.campaign_vendors enable row level security;

-- Anyone sees an approved vendor (shown on the campaign); a fan may propose a new one as 'pending'; only an admin
-- approves or suspends. The money destination is only ever an approved, verified vendor.
create policy campaign_vendors_public_read on public.campaign_vendors for select to anon, authenticated
  using (status = 'approved' or public.is_app_admin());
create policy campaign_vendors_propose on public.campaign_vendors for insert to authenticated
  with check (status = 'pending');
create policy campaign_vendors_admin_update on public.campaign_vendors for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

revoke all on public.campaign_vendors from anon, authenticated;
grant select on public.campaign_vendors to anon, authenticated;
grant insert, update on public.campaign_vendors to authenticated;
grant all on public.campaign_vendors to service_role;

-- ---------- campaigns: tie to a vendor + what's being bought ----------
alter table public.campaigns add column vendor_id uuid references public.campaign_vendors (id) on delete set null;
alter table public.campaigns add column item_description text;

-- New lifecycle states for the vendor flow: 'awaiting_invoice' (goal met, vendor's invoice pending), and the existing
-- 'paid_out' means the money was released to the vendor.
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('draft','pending_review','live','funded','awaiting_invoice','failed','paid_out','cancelled'));

-- ---------- payouts to the vendor (append-only money/record trail) ----------
create table public.campaign_payouts (
  id                    uuid primary key default gen_random_uuid(),
  campaign_id           uuid not null references public.campaigns (id) on delete cascade,
  vendor_id             uuid not null references public.campaign_vendors (id),
  amount_agorot         bigint not null check (amount_agorot >= 0),               -- released to the vendor (minor units)
  fee_agorot            bigint not null default 0 check (fee_agorot >= 0),         -- onefan's platform+clearing cut
  invoice_path          text,                                                     -- private Storage key of the tax invoice
  invoice_number        text,
  invoice_date          date,
  invoice_amount_agorot bigint check (invoice_amount_agorot is null or invoice_amount_agorot >= 0),
  status                text not null default 'pending' check (status in ('pending','verified','released','failed')),
  released_at           timestamptz,
  created_at            timestamptz not null default now()
);

create index campaign_payouts_campaign_idx on public.campaign_payouts (campaign_id);

alter table public.campaign_payouts enable row level security;

-- The campaign's organizer and admins can see its payout trail; nobody else, and the public never reads it. State
-- changes (verify/release) come from the server (service_role) after the invoice is checked — never from a client.
create policy campaign_payouts_read on public.campaign_payouts for select to authenticated
  using (
    public.is_app_admin()
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.organizer_id = (select auth.uid()))
  );

revoke all on public.campaign_payouts from anon, authenticated;
grant select on public.campaign_payouts to authenticated;
grant all on public.campaign_payouts to service_role;
