#!/usr/bin/env bash
# VibePlay PostgreSQL backup (spec §34).
#
# Modes:
#   compose (default) — pg_dump inside the docker compose `postgres` service;
#   direct            — pg_dump against $DATABASE_URL (managed Postgres).
#
# Output: $BACKUP_DIR/postgres/vibeplay-<UTC timestamp>.dump[.age|.enc]
#   Custom-format dumps (-Fc) restore selectively and compress well.
#
# Encryption (recommended for any off-host copy):
#   BACKUP_AGE_RECIPIENT=age1...     → age -r (preferred)
#   BACKUP_PASSPHRASE=...            → openssl enc -aes-256-cbc -pbkdf2
#   (none)                           → plaintext dump, local testing only
#
# Retention: BACKUP_RETENTION_DAYS (default 14) — older files are pruned.
# No secrets are hardcoded; everything comes from the environment.
set -euo pipefail

MODE="${BACKUP_MODE:-compose}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
COMPOSE_SERVICE="${BACKUP_PG_SERVICE:-postgres}"
PG_USER="${BACKUP_PG_USER:-vibeplay}"
PG_DB="${BACKUP_PG_DB:-vibeplay}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$BACKUP_DIR/postgres"
OUT="$OUT_DIR/vibeplay-$STAMP.dump"

mkdir -p "$OUT_DIR"

echo "[backup-postgres] mode=$MODE → $OUT"
case "$MODE" in
  compose)
    docker compose exec -T "$COMPOSE_SERVICE" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc >"$OUT"
    ;;
  direct)
    : "${DATABASE_URL:?direct mode requires DATABASE_URL}"
    pg_dump "$DATABASE_URL" -Fc >"$OUT"
    ;;
  *)
    echo "unknown BACKUP_MODE: $MODE" >&2
    exit 1
    ;;
esac

if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$OUT.age" "$OUT" && rm "$OUT"
  OUT="$OUT.age"
elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$OUT" -out "$OUT.enc"
  rm "$OUT"
  OUT="$OUT.enc"
else
  echo "[backup-postgres] WARNING: dump is NOT encrypted (set BACKUP_AGE_RECIPIENT or BACKUP_PASSPHRASE)"
fi

# Integrity manifest + retention.
(cd "$OUT_DIR" && shasum -a 256 "$(basename "$OUT")" >>SHA256SUMS 2>/dev/null) ||
  (cd "$OUT_DIR" && sha256sum "$(basename "$OUT")" >>SHA256SUMS)
find "$OUT_DIR" -name 'vibeplay-*' -type f -mtime "+$RETENTION_DAYS" -delete

echo "[backup-postgres] done: $OUT ($(du -h "$OUT" | cut -f1))"
