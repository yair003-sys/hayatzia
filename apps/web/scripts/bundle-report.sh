#!/usr/bin/env bash
# After `next build`: the client JS the browser loads, as a GitHub notice (readable through the REST API, like
# ci-step.sh's failure annotations). Largest chunks with their raw / gzip size and which known libraries they hold, and
# the chunks the busiest pages reference. Never fails the build (perf round 2).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 0
dir=.next/static/chunks
[ -d "$dir" ] || { echo "no $dir"; exit 0; }

markers() {
  local f="$1" m=""
  grep -q 'ZodError' "$f" && m="$m zod"
  grep -q 'Extended_Pictographic' "$f" && m="$m emoji-regex"
  grep -q 'phx_join' "$f" && m="$m realtime"
  grep -q 'GoTrueClient' "$f" && m="$m gotrue"
  grep -q 'PostgrestClient\|PostgrestBuilder' "$f" && m="$m postgrest"
  grep -q 'qrcode\|QR Code\|getSymbolSize' "$f" && m="$m qrcode"
  grep -q 'getContext(' "$f" && m="$m canvas"
  grep -q 'react-dom' "$f" && m="$m react-dom"
  echo "${m:- -}"
}

kb() { echo $(( ($1 + 512) / 1024 )); }

report="$(mktemp)"
{
  total=0; gz=0
  while read -r f; do
    total=$((total + $(wc -c <"$f"))); gz=$((gz + $(gzip -9c "$f" | wc -c)))
  done < <(find "$dir" -name '*.js')
  echo "all client chunks: $(kb $total) KB raw / $(kb $gz) KB gzip"
  echo "largest chunks (raw KB / gzip KB / contents):"
  find "$dir" -name '*.js' -printf '%s %p\n' | sort -rn | head -12 | while read -r s f; do
    echo "  $(kb "$s") / $(kb "$(gzip -9c "$f" | wc -c)")  $(basename "$f") [$(markers "$f")]"
  done
  for page in '(app)/stand' '(app)/square' '(app)/stand/chat' '(app)/matches/[id]' '(app)/inbox'; do
    man=".next/server/app/$page/page_client-reference-manifest.js"
    [ -f "$man" ] || continue
    s=0; g=0; n=0; libs=""
    for c in $(grep -o 'static/chunks/[A-Za-z0-9_./-]*\.js' "$man" | sort -u); do
      f=".next/$c"; [ -f "$f" ] || continue
      s=$((s + $(wc -c <"$f"))); g=$((g + $(gzip -9c "$f" | wc -c))); n=$((n + 1)); libs="$libs $(markers "$f")"
    done
    echo "page /$page: $n chunks, $(kb $s) KB raw / $(kb $g) KB gzip; holds:$(echo "$libs" | tr ' ' '\n' | grep -v '^-\?$' | sort -u | tr '\n' ' ')"
  done
} >"$report" 2>/dev/null
cat "$report"
msg="$(sed ':a;N;$!ba;s/%/%25/g;s/\r/%0D/g;s/\n/%0A/g' "$report")"
echo "::notice title=bundle report::${msg}"
exit 0
