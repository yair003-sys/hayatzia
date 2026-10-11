#!/usr/bin/env bash
# Runs a CI step; on failure, re-emits the tail of its output as a GitHub annotation.
# Annotations are readable through the GitHub REST API, which is how the Claude sandbox reads CI failures
# (raw job logs live on blob storage the sandbox cannot reach).
set -uo pipefail
title="$1"; shift
out="$(mktemp)"
"$@" >"$out" 2>&1
code=$?
cat "$out"
if [ $code -ne 0 ]; then
  msg="$(tail -n 80 "$out" | sed -e 's/\x1b\[[0-9;]*m//g' | sed ':a;N;$!ba;s/%/%25/g;s/\r/%0D/g;s/\n/%0A/g')"
  echo "::error title=${title} failed::${msg}"
fi
exit $code
