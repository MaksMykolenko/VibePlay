#!/usr/bin/env bash
# VibePlay object-storage backup (spec §34).
#
# Backs up the published-games bucket (immutable per-version trees) and,
# optionally, the quarantine bucket (short-lived by design — 7-day expiry).
#
# Modes:
#   minio (default) — `mc mirror` from the compose MinIO to $BACKUP_DIR;
#   s3              — any S3-compatible remote → remote (rclone or aws cli);
#   fs              — fs storage driver: plain rsync of FS_STORAGE_ROOT.
#
# Published version trees are immutable (games/{gameId}/{versionId}/...), so
# incremental mirroring is cheap and idempotent.
set -euo pipefail

MODE="${STORAGE_BACKUP_MODE:-minio}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
PUBLISHED_BUCKET="${S3_PUBLISHED_BUCKET:-vibeplay-published}"
QUARANTINE_BUCKET="${S3_QUARANTINE_BUCKET:-vibeplay-quarantine}"
INCLUDE_QUARANTINE="${BACKUP_INCLUDE_QUARANTINE:-false}"
OUT="$BACKUP_DIR/storage"

mkdir -p "$OUT"

case "$MODE" in
  minio)
    # Reuses the official mc image; credentials come from the environment.
    : "${MINIO_ROOT_USER:?set MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD:?set MINIO_ROOT_PASSWORD}"
    MINIO_HOST="${MINIO_HOST:-http://localhost:9000}"
    docker run --rm --network host \
      -e MC_HOST_local="http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@${MINIO_HOST#http://}" \
      -v "$(cd "$OUT" && pwd)":/backup \
      minio/mc:latest mirror --preserve "local/$PUBLISHED_BUCKET" "/backup/$PUBLISHED_BUCKET"
    if [ "$INCLUDE_QUARANTINE" = "true" ]; then
      docker run --rm --network host \
        -e MC_HOST_local="http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@${MINIO_HOST#http://}" \
        -v "$(cd "$OUT" && pwd)":/backup \
        minio/mc:latest mirror --preserve "local/$QUARANTINE_BUCKET" "/backup/$QUARANTINE_BUCKET"
    fi
    ;;
  s3)
    : "${BACKUP_S3_DEST:?s3 mode requires BACKUP_S3_DEST (e.g. s3://vibeplay-backups)}"
    aws s3 sync "s3://$PUBLISHED_BUCKET" "$BACKUP_S3_DEST/$PUBLISHED_BUCKET" \
      ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
    ;;
  fs)
    : "${FS_STORAGE_ROOT:?fs mode requires FS_STORAGE_ROOT}"
    rsync -a --delete "$FS_STORAGE_ROOT/$PUBLISHED_BUCKET/" "$OUT/$PUBLISHED_BUCKET/"
    ;;
  *)
    echo "unknown STORAGE_BACKUP_MODE: $MODE" >&2
    exit 1
    ;;
esac

echo "[backup-storage] done → $OUT"
