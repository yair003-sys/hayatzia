#!/usr/bin/env bash
# Re-emits a text file as GitHub notice annotations (≤ 10 per step, ~30 kB each), so the results can be read through
# the REST API (check-run annotations) where artifacts and raw logs are not reachable.
# Usage: annotate.sh FILE TITLE [MAX_PARTS]
f="$1"; title="$2"; max="${3:-9}"
[ -f "$f" ] || exit 0
split -C 30000 -d -a 2 "$f" "$f.part."
n=0
for p in "$f".part.*; do
  n=$((n + 1))
  [ "$n" -gt "$max" ] && break
  msg=$(sed -e 's/%/%25/g' "$p" | sed ':a;N;$!ba;s/\r/%0D/g;s/\n/%0A/g')
  echo "::notice title=${title} ${n}::${msg}"
done
rm -f "$f".part.*
