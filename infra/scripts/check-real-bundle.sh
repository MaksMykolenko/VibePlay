#!/usr/bin/env bash
# CI guard (spec §12, §43): the REAL web bundle must not ship demo auth artifacts.
set -euo pipefail

DIST_DIR="${1:?usage: check-real-bundle.sh <dist dir>}"

patterns=(
  'vibeplay-demo-password'
  'switchDemoRole'
  'player@vibeplay.demo'
  'creator@vibeplay.demo'
  'admin@vibeplay.demo'
  'Frontend Demo'
)

fail=0
for p in "${patterns[@]}"; do
  if grep -R --fixed-strings --include='*.js' -l "$p" "$DIST_DIR" >/dev/null 2>&1; then
    echo "::error::real bundle contains demo artifact: $p"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "check-real-bundle: OK — no demo artifacts in real build"
