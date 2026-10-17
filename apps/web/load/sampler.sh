#!/usr/bin/env bash
# LOAD TEST ONLY: every 10 s while the load runs, records what the local stack is doing (real measurements):
# open websocket connections inside the Realtime container, Postgres connections by state, and the CPU / memory of
# every container and of the runner. Stops when $OUT/stop exists. Output: $OUT/samples.tsv, $OUT/docker-stats.txt.
set -u
OUT="$1"
DB_URL="$2"
RT=$(docker ps --format '{{.Names}}' | grep -m1 '^supabase_realtime_')
printf 'time\trealtime_ws_established\tpg_total\tpg_active\tpg_idle_in_tx\tpg_waiting_lock\trunner_load1\trunner_mem_used_mb\n' > "$OUT/samples.tsv"
: > "$OUT/docker-stats.txt"
while [ ! -f "$OUT/stop" ]; do
  t=$(date -u +%H:%M:%S)
  # ESTABLISHED (state 01) sockets on the Realtime port 4000 (hex 0FA0), IPv4 + IPv6, seen from inside the container.
  rt=$(docker exec "$RT" sh -c 'cat /proc/net/tcp /proc/net/tcp6 2>/dev/null' 2>/dev/null | awk '$2 ~ /:0FA0$/ && $4 == "01"' | wc -l)
  pg=$(psql "$DB_URL" -XAtF $'\t' -c "select count(*), count(*) filter (where state = 'active'), count(*) filter (where state like 'idle in transaction%'), count(*) filter (where wait_event_type = 'Lock') from pg_stat_activity where backend_type = 'client backend'" 2>/dev/null || printf '\t\t\t')
  load1=$(cut -d' ' -f1 /proc/loadavg)
  mem=$(free -m | awk '/^Mem:/ {print $3}')
  printf '%s\t%s\t%s\t%s\t%s\n' "$t" "$rt" "$pg" "$load1" "$mem" >> "$OUT/samples.tsv"
  { echo "## $t"; docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null
    echo "-- runner processes (k6, next, chromium…): command %cpu rss_kb"; ps -eo comm,pcpu,rss --sort=-pcpu | sed -n 2,7p; echo "-- args"; ps -eo pcpu,args --sort=-pcpu | sed -n 2,5p | cut -c1-120; } >> "$OUT/docker-stats.txt"
  sleep 8
done
