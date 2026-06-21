#!/usr/bin/env bash
# CI guard: forbidden production patterns (spec §40).
set -euo pipefail

fail=0

# 1. No committed secret env files (only the known value-free templates).
if git ls-files | grep -E '(^|/)\.env(\..+)?$' | \
     grep -Ev '(^|/)\.env\.example$|(^|/)\.env\.hostinger\.example$|(^|/)\.env\.railway\.template$'; then
  echo "::error::.env files must never be committed"
  fail=1
fi

# 5. Production manifests must fail closed for malware scanning and email, and
#    object storage must remain private to the service network.
production_manifests=(
  docker-compose.production.example.yml
  docker-compose.hostinger.yml
  docker-compose.railway.yml
)
if grep -nE 'SCAN_DRIVER:[[:space:]]*(none|off)|EMAIL_DRIVER:[[:space:]]*memory|9000:9000|mc anonymous' \
     "${production_manifests[@]}"; then
  echo "::error::unsafe production deployment setting found"
  fail=1
fi

# 2. No demo passwords or demo role switching outside the demo data layer.
#    The demo client lives ONLY in apps/web/src/lib/api/demo/.
if grep -RIn --include='*.ts' --include='*.tsx' \
     --exclude-dir=node_modules --exclude-dir=dist \
     -e 'switchDemoRole' -e 'DEMO_PASSWORD' \
     apps/api apps/worker apps/game-host packages 2>/dev/null; then
  echo "::error::demo auth artifacts found in server code"
  fail=1
fi

# 3. localStorage must never be used as an auth/session store in real client code.
if grep -RIn --include='*.ts' --include='*.tsx' \
     --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=demo \
     -e "localStorage.setItem('vibeplay_current_user'" \
     -e 'localStorage.setItem("vibeplay_current_user"' \
     apps/web/src 2>/dev/null; then
  echo "::error::localStorage session storage found outside the demo layer"
  fail=1
fi

# 4. No obvious hardcoded secrets in source.
if grep -RInE --include='*.ts' --include='*.tsx' --include='*.yml' --include='*.yaml' \
     --exclude-dir=node_modules --exclude-dir=dist \
     '(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----)' \
     . 2>/dev/null; then
  echo "::error::possible hardcoded credentials found"
  fail=1
fi

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "forbidden-scan: OK"
