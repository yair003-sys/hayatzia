-- Europe-ready money (owner's vision, 2026-10-28): a campaign carries its own currency, so the platform can run in
-- euros (and other markets) and not only shekels. Amounts stay in the currency's minor units (agorot / cents) as
-- integers. We only widen the allowed set here — the non-custodial model, the counters and the RLS are unchanged.
alter table public.campaigns drop constraint if exists campaigns_currency_check;
alter table public.campaigns add constraint campaigns_currency_check
  check (currency in ('ILS', 'EUR', 'USD', 'GBP'));
