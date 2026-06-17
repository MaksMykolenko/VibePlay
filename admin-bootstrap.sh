#!/usr/bin/env bash
# Create the first admin login (admin@vibeplay.local) on the self-hosted VM.
# Registration is invite-only, so this seeds a verified admin directly.
# Runs the seed inside the build-stage image (which has tsx + argon2), using the
# SAME PASSWORD_PEPPER as the running API so the login hash matches.
#
# Usage:  ./admin-bootstrap.sh 'YourStrongPassw0rd!'
set -euo pipefail
cd "$(dirname "$0")"

PASS="${1:-}"
[[ -n "$PASS" ]] || { echo "Usage: ./admin-bootstrap.sh '<admin-password>'"; exit 1; }
[[ -f .env ]] || { echo ".env not found — run ./deploy-oracle.sh first."; exit 1; }

set -a; source .env; set +a
DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
SUDO=""; docker info >/dev/null 2>&1 || SUDO="sudo"

echo "==> Seeding admin@vibeplay.local ..."
$SUDO $DC -f docker-compose.oracle.yml --env-file .env run --rm --no-deps \
  -e NODE_ENV=development \
  -e PASSWORD_PEPPER="$PASSWORD_PEPPER" \
  -e SEED_PASSWORD="$PASS" \
  -e DATABASE_URL="postgresql://vibeplay:${POSTGRES_PASSWORD}@postgres:5432/vibeplay" \
  migrate sh -c 'cd /repo/packages/database && npx tsx src/seed.ts'

echo ""
echo "============================================================"
echo "  Admin ready — log in:"
echo "    URL:      ${WEB_ORIGIN}"
echo "    email:    admin@vibeplay.local"
echo "    password: ${PASS}"
echo "  (Seed also adds demo dev accounts; ignore or remove them later.)"
echo "============================================================"
