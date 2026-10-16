-- LOAD TEST ONLY: picks the seeded fans who get a session (fans 1..20 for the UI checks + an even sample of :sample
-- others, never 21..100) with what the scenarios need: an accepted private thread and its other fan, a group, and
-- the club's match in the current round. Writes :outdir/fans.csv and :outdir/meta.csv.
--   psql "$DB_URL" -v sample=5000 -v outdir=/tmp/x -f load/sample.sql
\set ON_ERROR_STOP on
\if :{?sample}
\else
  \set sample 5000
\endif
select greatest(1, (select v::int from load.meta where k = 'users') / :sample) as step \gset
create temp table s as
select u.i, u.id, u.team, t.id as thread, case when t.user_a = u.id then t.user_b else t.user_a end as peer,
       (select m.group_id from public.dm_group_members m where m.user_id = u.id and m.role <> 'invited' limit 1) as grp,
       (select f.id from load.fixtures f where f.round = 11 and u.team in (f.home, f.away) limit 1) as fixture
  from load.users u
  left join lateral (select t.id, t.user_a, t.user_b from public.dm_threads t
                      where (t.user_a = u.id or t.user_b = u.id) and t.accepted_at is not null
                      order by t.last_at desc limit 1) t on true
 where u.i <= 20 or (u.i > 100 and u.i % :step = 0);
\set fans_csv :outdir/fans.csv
\set meta_csv :outdir/meta.csv
\o :fans_csv
copy (select i, id, team, thread, peer, grp, fixture from s order by i) to stdout csv;
\o :meta_csv
copy (select k, v from load.meta order by k) to stdout csv;
\o
select count(*) as sampled, count(*) filter (where thread is not null) as with_thread from s;
