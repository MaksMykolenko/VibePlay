#!/usr/bin/env bash
# CI guard (spec §12, §43): the REAL web bundle must not ship demo functionality.
#
# What we assert:
#  - no demo account emails / demo passwords;
#  - no demo banner text;
#  - no localStorage mock persistence keys (mock catalog/users);
#  - no demo chunk emitted at all (the dynamic import must be dead-code-eliminated).
#
# Note: the inert property NAME `switchDemoRole` may remain in the context object
# shape; its body is statically reduced to a no-op (`return`) in real builds.
set -euo pipefail

DIST_DIR="${1:?usage: check-real-bundle.sh <dist dir>}"

patterns=(
  'player@vibeplay.demo'
  'creator@vibeplay.demo'
  'admin@vibeplay.demo'
  'DEMO_PASSWORD'
  'Frontend Demo'
  'vibeplay_users'
  'vibeplay_demo_session'
  'NOT_AVAILABLE_IN_DEMO'
)

fail=0
for p in "${patterns[@]}"; do
  if grep -R --fixed-strings --include='*.js' -l "$p" "$DIST_DIR" >/dev/null 2>&1; then
    echo "::error::real bundle contains demo artifact: $p"
    fail=1
  fi
done

# The demo client must not be emitted even as an unused chunk.
if ls "$DIST_DIR"/assets/demo-*.js >/dev/null 2>&1; then
  echo "::error::real build emitted a demo chunk"
  fail=1
fi
if ls "$DIST_DIR"/assets/mock*-*.js >/dev/null 2>&1; then
  echo "::error::real build emitted mock data chunks"
  fail=1
fi

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "check-real-bundle: OK — no demo functionality in real build"
