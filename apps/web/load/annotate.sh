#!/usr/bin/env bash
# Re-emits a text file as GitHub notice annotations so the results can be read through the REST API (check-run
# annotations) where artifacts and raw logs are not reachable. GitHub keeps 4096 characters per annotation, 10 notices
# per step and 50 per job, so the file goes out in ~3.8 kB parts, FIRST..LAST of them in this step.
# Usage: annotate.sh FILE TITLE FIRST LAST
f="$1"; title="$2"; first="${3:-1}"; last="${4:-10}"
[ -f "$f" ] || exit 0
d=$(mktemp -d)
split -C 3800 -d -a 3 "$f" "$d/p."
n=0
for p in "$d"/p.*; do
  n=$((n + 1))
  [ "$n" -lt "$first" ] && continue
  [ "$n" -gt "$last" ] && break
  msg=$(sed -e 's/%/%25/g' "$p" | sed ':a;N;$!ba;s/\r/%0D/g;s/\n/%0A/g')
  echo "::notice title=${title} ${n}::${msg}"
done
total=$(ls "$d" | wc -l)
rm -rf "$d"
echo "$title: $total parts, emitted $first..$last"
