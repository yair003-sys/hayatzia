#!/usr/bin/env bash
# LOAD TEST ONLY: assembles $OUT/report.md from the run's own measurements (k6 summary, consistency checks, sampler,
# pg_stat_statements, EXPLAIN plans, container logs). Every number in it was measured in this run.
set -u
OUT="$1"
DB_URL="$2"
R="$OUT/report.md"
q() { psql "$DB_URL" -XAt "$@" 2>/dev/null; }

{
  echo "## Local load test: ${USERS:-?} seeded fans (run ${GITHUB_RUN_ID:-local})"
  echo
  echo "Everything ran on one GitHub runner: $(nproc) vCPU, $(free -g | awk '/^Mem:/ {print $2}') GB RAM, local Supabase (Docker) + Next.js production build + k6 + Chromium."
  echo "No hosted Supabase project or Vercel was touched. Data: \"נתוני עומס\" seed (load/seed.sql)."
  if [ -f "$OUT/fixes.txt" ]; then echo; cat "$OUT/fixes.txt"; else echo; echo "This run: the database exactly as the migrations make it (no fixes applied)."; fi
  echo
  echo "### Seed"
  echo
  cat "$OUT/seed-counts.txt" 2>/dev/null
  echo
  echo "Seed time: $(cat "$OUT/seed-seconds.txt" 2>/dev/null) s."
  echo
  cat "$OUT/k6-summary.md" 2>/dev/null || echo "(no k6 summary: k6 did not finish)"
  echo
  echo "### Realtime and machine during the load (sampled every ~10 s)"
  echo
  if [ -f "$OUT/samples.tsv" ]; then
    awk -F'\t' 'NR > 1 {
        if ($2 + 0 > rt) rt = $2 + 0; if ($3 + 0 > pg) pg = $3 + 0; if ($4 + 0 > act) act = $4 + 0;
        if ($6 + 0 > lk) lk = $6 + 0; if ($7 + 0 > ld) ld = $7 + 0; if ($8 + 0 > mem) mem = $8 + 0; n++ }
      END { printf "Samples %d · peak websockets open in Realtime %d · peak Postgres connections %d (active %d, waiting on a lock %d) · peak load average %.1f · peak memory used %d MB\n", n, rt, pg, act, lk, ld, mem }' "$OUT/samples.tsv"
    echo
    echo "Peak CPU per container (docker stats, 100% = one core):"
    echo
    awk -F'\t' '/^supabase_|^[a-z]/ && NF >= 3 { gsub("%", "", $2); if ($2 + 0 > max[$1]) max[$1] = $2 + 0 }
      END { for (k in max) printf "%s %.0f%%\n", k, max[k] }' "$OUT/docker-stats.txt" | sort -t' ' -k2 -rn | head -12 | sed 's/^/- /'
    echo
    echo "Processes on the runner itself, highest value seen of ps %cpu (= CPU time / time since the process started; 100% = one core):"
    echo
    awk '/^-- runner/ {p = 1; next} /^## |^-- args/ {p = 0} p && NF >= 3 { if ($2 + 0 > m[$1]) m[$1] = $2 + 0 }
      END { for (k in m) printf "%s %.0f%%\n", k, m[k] }' "$OUT/docker-stats.txt" | sort -t' ' -k2 -rn | head -6 | sed 's/^/- /'
    echo
    echo "Busiest command lines at the last sample:"
    echo
    echo '```'
    awk '/^-- args/ {p = 1; buf = ""; next} /^## / {p = 0} p {buf = buf $0 "\n"} END {printf "%s", buf}' "$OUT/docker-stats.txt"
    echo '```'
  fi
  echo
  echo "Gateway and container limits of the local stack:"
  echo
  cat "$OUT/limits.txt" 2>/dev/null
  echo
  echo "Realtime tenant limits used for this run:"
  echo
  cat "$OUT/realtime-limits.txt" 2>/dev/null
  echo
  echo "### UI consistency checks (Playwright, 375 px, as seeded fans)"
  echo
  echo "| phase | check | result | measured |"
  echo "|---|---|---|---|"
  for p in during after; do
    [ -f "$OUT/consistency-$p.jsonl" ] || continue
    node -e '
      const fs = require("fs")
      for (const l of fs.readFileSync(process.argv[1], "utf8").trim().split("\n")) {
        if (!l) continue
        const r = JSON.parse(l)
        console.log(`| ${r.phase} | ${r.check} | ${r.pass ? "PASS" : "FAIL"} | ${String(r.detail).replace(/\|/g, "/")} |`)
      }' "$OUT/consistency-$p.jsonl"
  done
  echo
  q -f "$(dirname "$0")/report.sql"
  echo
  echo "### EXPLAIN ANALYZE on the seeded data (as a seeded fan, RLS on; full plans in explain.txt)"
  echo
  awk '/^### /{name=substr($0,5)} /Execution Time/{printf "- %s: %s\n", name, $3 " ms"}' "$OUT/explain.txt" 2>/dev/null
  echo
  echo "Triggers on the writes (from the same plans):"
  echo
  awk '/^### /{name=substr($0,5)} /^ *Trigger [a-z_]+:/{sub(/^ */, ""); printf "- %s → %s\n", name, $0}' "$OUT/explain.txt" 2>/dev/null
  echo
  echo "### Errors in the logs during the run (numbers and ids replaced by N / <id>, top 15 each)"
  for c in db rest realtime auth kong storage; do
    name=$(docker ps -a --format '{{.Names}}' | grep -m1 "^supabase_${c}_")
    [ -n "$name" ] || continue
    echo
    echo "**${c}** ($name):"
    echo
    echo '```'
    docker logs "$name" 2>&1 | grep -E 'ERROR|FATAL|PANIC|"level":"error"|\[error\]|error=' \
      | sed -E 's/^.*(ERROR|FATAL|PANIC):/\1:/; s/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/<id>/g; s/[0-9]+/N/g' \
      | cut -c1-220 | sort | uniq -c | sort -rn | head -15
    echo '```'
  done
  if [ -f "$OUT/next.log" ]; then
    echo
    # Finding 7 of 2026-10-17: the browser Supabase client created while rendering on the server (should be 0).
    echo "**next start**: \"Date.now() while prerendering\" errors: $(grep -c 'unstable value Date.now()' "$OUT/next.log")"
    echo
    echo "**next start** (errors, top 10):"
    echo
    echo '```'
    grep -iE 'error|failed|unhandled' "$OUT/next.log" | sed -E 's/[0-9a-f]{8}-[0-9a-f-]{27}/<id>/g; s/[0-9]+/N/g' | cut -c1-220 | sort | uniq -c | sort -rn | head -10
    echo '```'
  fi
} > "$R"
echo "report: $R ($(wc -c < "$R") bytes)"
