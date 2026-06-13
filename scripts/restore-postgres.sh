#!/usr/bin/env bash
# VibePlay PostgreSQL restore (spec §34). Restores a backup produced by
# scripts/backup-postgres.sh into a CLEAN database.
#
#   ./scripts/restore-postgres.sh <backup-file> [target-db]
#
# Modes mirror backup-postgres.sh: compose (default) or direct.
# Decryption: .age needs BACKUP_AGE_IDENTITY (key file path);
#             .enc needs BACKUP_PASSPHRASE.
#
# Safety: refuses to restore into a non-empty database unless
# RESTORE_FORCE=true — restoring over live data is an explicit decision.
set -euo pipefail

SRC="${1:?usage: restore-postgres.sh <backup-file> [target-db]}"
MODE="${BACKUP_MODE:-compose}"
COMPOSE_SERVICE="${BACKUP_PG_SERVICE:-postgres}"
PG_USER="${BACKUP_PG_USER:-vibeplay}"
TARGET_DB="${2:-${RESTORE_TARGET_DB:-vibeplay_restore_check}}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DUMP="$WORK/restore.dump"

case "$SRC" in
  *.age)
    : "${BACKUP_AGE_IDENTITY:?.age backup requires BACKUP_AGE_IDENTITY (key file)}"
    age -d -i "$BACKUP_AGE_IDENTITY" -o "$DUMP" "$SRC"
    ;;
  *.enc)
    : "${BACKUP_PASSPHRASE:?.enc backup requires BACKUP_PASSPHRASE}"
    openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$SRC" -out "$DUMP"
    ;;
  *)
    cp "$SRC" "$DUMP"
    ;;
esac

run_psql() {
  if [ "$MODE" = "compose" ]; then
    docker compose exec -T "$COMPOSE_SERVICE" psql -U "$PG_USER" -d postgres -tAc "$1"
  else
    : "${RESTORE_ADMIN_URL:?direct mode requires RESTORE_ADMIN_URL (postgres superuser/owner URL)}"
    psql "$RESTORE_ADMIN_URL" -tAc "$1"
  fi
}

EXISTS="$(run_psql "SELECT 1 FROM pg_database WHERE datname='$TARGET_DB'" | tr -d '[:space:]')"
if [ "$EXISTS" = "1" ]; then
  if [ "${RESTORE_FORCE:-false}" != "true" ]; then
    echo "[restore-postgres] database '$TARGET_DB' already exists — set RESTORE_FORCE=true to drop and recreate" >&2
    exit 1
  fi
  run_psql "DROP DATABASE \"$TARGET_DB\" WITH (FORCE)"
fi
run_psql "CREATE DATABASE \"$TARGET_DB\""

echo "[restore-postgres] restoring $SRC → $TARGET_DB (mode=$MODE)"
if [ "$MODE" = "compose" ]; then
  docker compose exec -T "$COMPOSE_SERVICE" pg_restore -U "$PG_USER" -d "$TARGET_DB" \
    --no-owner --no-privileges <"$DUMP"
else
  pg_restore -d "${RESTORE_ADMIN_URL%/*}/$TARGET_DB" --no-owner --no-privileges "$DUMP"
fi

# Post-restore verification: core tables exist and row counts are visible.
echo "[restore-postgres] verification:"
if [ "$MODE" = "compose" ]; then
  docker compose exec -T "$COMPOSE_SERVICE" psql -U "$PG_USER" -d "$TARGET_DB" -c \
    'SELECT (SELECT count(*) FROM "User")  AS users,
            (SELECT count(*) FROM "Game")  AS games,
            (SELECT count(*) FROM "GameVersion") AS versions,
            (SELECT count(*) FROM "ModerationDecision") AS moderation;'
else
  psql "${RESTORE_ADMIN_URL%/*}/$TARGET_DB" -c \
    'SELECT (SELECT count(*) FROM "User")  AS users,
            (SELECT count(*) FROM "Game")  AS games,
            (SELECT count(*) FROM "GameVersion") AS versions,
            (SELECT count(*) FROM "ModerationDecision") AS moderation;'
fi

echo "[restore-postgres] done — verify migration compatibility with:"
echo "  DATABASE_URL=<url to $TARGET_DB> npx prisma migrate status (in packages/database)"
