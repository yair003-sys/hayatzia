-- LOAD TEST ONLY: database side of the report (markdown), read from the local stack after the load.
-- pg_stat_statements was reset just before k6 started, so these are the load's own statements.
\pset format unaligned
\pset tuples_only on
\pset pager off

select '### Postgres: top 25 statements by total time';
select '';
select '| # | calls | total s | mean ms | max ms | rows/call | statement (first 180 chars) |';
select '|---:|---:|---:|---:|---:|---:|---|';
select format('| %s | %s | %s | %s | %s | %s | `%s` |', row_number() over (order by total_exec_time desc), calls,
              round((total_exec_time / 1000)::numeric, 1), round(mean_exec_time::numeric, 2), round(max_exec_time::numeric, 1),
              round((rows::numeric / greatest(calls, 1)), 1),
              replace(left(regexp_replace(query, '\s+', ' ', 'g'), 180), '|', '\|'))
  from extensions.pg_stat_statements
 where dbid = (select oid from pg_database where datname = current_database())
 order by total_exec_time desc limit 25;
select '';
select '### Postgres: top 25 statements by mean time (called at least 20 times)';
select '';
select '| # | calls | mean ms | max ms | total s | statement (first 180 chars) |';
select '|---:|---:|---:|---:|---:|---|';
select format('| %s | %s | %s | %s | %s | `%s` |', row_number() over (order by mean_exec_time desc), calls,
              round(mean_exec_time::numeric, 2), round(max_exec_time::numeric, 1), round((total_exec_time / 1000)::numeric, 1),
              replace(left(regexp_replace(query, '\s+', ' ', 'g'), 180), '|', '\|'))
  from extensions.pg_stat_statements
 where dbid = (select oid from pg_database where datname = current_database()) and calls >= 20
 order by mean_exec_time desc limit 25;
select '';
select '### Postgres: biggest tables after the load';
select '';
select '| table | rows (estimate) | total size | of which indexes |';
select '|---|---:|---:|---:|';
select format('| %s | %s | %s | %s |', c.oid::regclass, c.reltuples::bigint, pg_size_pretty(pg_total_relation_size(c.oid)),
              pg_size_pretty(pg_indexes_size(c.oid)))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p') and n.nspname in ('public', 'auth', 'realtime', 'storage')
 order by pg_total_relation_size(c.oid) desc limit 20;
select '';
select format('Database size %s · cache hit %s%% · deadlocks %s · rolled-back transactions %s · temp files %s (%s)',
              pg_size_pretty(pg_database_size(current_database())),
              round(100.0 * blks_hit / greatest(blks_hit + blks_read, 1), 2), deadlocks, xact_rollback, temp_files,
              pg_size_pretty(temp_bytes))
  from pg_stat_database where datname = current_database();
select '';
select '### Postgres: tables read by sequential scan during the load (scans of more than 1,000 rows)';
select '';
select '| table | seq scans | rows read by seq scans | index scans |';
select '|---|---:|---:|---:|';
select format('| %s | %s | %s | %s |', relid::regclass, seq_scan, seq_tup_read, coalesce(idx_scan, 0))
  from pg_stat_user_tables where seq_tup_read > 1000 and schemaname in ('public', 'realtime')
 order by seq_tup_read desc limit 15;
select '';
select '### What the load wrote';
select '';
select format('team chat %s · match rooms %s · Square likes %s · comments %s · private messages %s · crowd-war fans %s · polls opened %s',
              (select count(*) from public.team_messages where created_at > (select v::timestamptz from load.meta where k = 'load_started')),
              (select count(*) from public.match_messages where created_at > (select v::timestamptz from load.meta where k = 'load_started')),
              (select count(*) from public.clip_likes) - (select v::bigint from load.meta where k = 'likes_before'),
              (select count(*) from public.clip_comments where created_at > (select v::timestamptz from load.meta where k = 'load_started')),
              (select count(*) from public.dm_messages where created_at > (select v::timestamptz from load.meta where k = 'load_started')),
              (select count(*) from public.crowd_war_fans), (select count(*) from public.match_polls));
select '';
select '### Consistency of trigger-kept counters after the load (database vs recount)';
select '';
select format('Square likes_count off on %s posts · crowd-war totals off on %s rows · team fan counts off on %s clubs',
              (select count(*) from public.clips c where c.likes_count <> (select count(*) from public.clip_likes l where l.clip_id = c.id)),
              (select count(*) from public.crowd_war_totals t where t.points <> coalesce((select sum(points) from public.crowd_war_fans f where f.fixture_id = t.fixture_id and f.team_id = t.team_id), 0)),
              (select count(*) from public.team_stats s where s.fans <> (select count(*) from public.profiles p where p.team_id = s.team_id)));
select '';
select '### Postgres settings of the local stack';
select '';
select string_agg(name || ' ' || setting || coalesce(unit, ''), ' · ' order by name) from pg_settings
 where name in ('max_connections', 'shared_buffers', 'work_mem', 'effective_cache_size', 'max_worker_processes');
