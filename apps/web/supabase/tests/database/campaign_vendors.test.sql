-- Vendor Direct model: the public sees only approved vendors, a fan may propose a 'pending' one but never a
-- self-approved one, only an admin approves, and a campaign's payout trail is visible to its organizer and admins
-- only. No real money here.
begin;
select plan(8);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'admin@test.local'),  -- admin
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'org@test.local'),    -- organizer
  ('00000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'str@test.local');    -- stranger
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'מנהל', 'mta'),
  ('00000000-0000-0000-0000-0000000000d2', 'מארגן', 'mta'),
  ('00000000-0000-0000-0000-0000000000d3', 'זר', 'mta');
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-0000000000d1');

insert into public.campaign_vendors (id, name, business_id, category, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'בית דפוס מאושר', '512345678', 'print', 'approved'),
  ('00000000-0000-0000-0000-0000000000b1', 'ספק ממתין', '598765432', 'pyro', 'pending');

insert into public.campaigns (id, organizer_id, team_id, title, category, goal_agorot, beneficiary_kind, beneficiary_name, status, deadline, vendor_id, item_description) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d2', 'mta', 'תפאורה לדרבי', 'tifo', 2000000, 'business', 'בית דפוס מאושר', 'live', now() + interval '5 days', '00000000-0000-0000-0000-0000000000a1', 'באנר ענק 20 מטר');

insert into public.campaign_payouts (campaign_id, vendor_id, amount_agorot, fee_agorot, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 1900000, 100000, 'pending');

-- Public read: a stranger sees the approved vendor, not the pending one.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d3','role','authenticated')::text, true);
select is((select count(*)::int from public.campaign_vendors where id = '00000000-0000-0000-0000-0000000000a1'), 1, 'a stranger sees an approved vendor');
select is((select count(*)::int from public.campaign_vendors where id = '00000000-0000-0000-0000-0000000000b1'), 0, 'a stranger does not see a pending vendor');

-- A fan may propose a pending vendor, but not a self-approved one.
select lives_ok(
  $$insert into public.campaign_vendors (name, business_id, category, status) values ('ספק מוצע', '511112222', 'apparel', 'pending')$$,
  'a fan can propose a pending vendor');
select throws_ok(
  $$insert into public.campaign_vendors (name, business_id, category, status) values ('ספק נוכל', '522223333', 'print', 'approved')$$,
  '42501', null, 'a fan cannot self-approve a vendor');

-- A non-admin cannot approve a pending vendor (RLS filters the update to zero rows; status stays pending).
select lives_ok(
  $$update public.campaign_vendors set status = 'approved' where id = '00000000-0000-0000-0000-0000000000b1'$$,
  'a non-admin update runs but matches nothing');

-- Payout trail: the organizer sees their campaign's payout; a stranger sees none.
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d2','role','authenticated')::text, true);
select is((select count(*)::int from public.campaign_payouts where campaign_id = '00000000-0000-0000-0000-0000000000c1'), 1, 'the organizer sees the payout trail');
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d3','role','authenticated')::text, true);
select is((select count(*)::int from public.campaign_payouts where campaign_id = '00000000-0000-0000-0000-0000000000c1'), 0, 'a stranger sees no payout trail');
reset role;

-- The non-admin update above must not have approved the vendor.
select is((select status from public.campaign_vendors where id = '00000000-0000-0000-0000-0000000000b1'), 'pending', 'the pending vendor was not approved by a non-admin');

select * from finish();
rollback;
