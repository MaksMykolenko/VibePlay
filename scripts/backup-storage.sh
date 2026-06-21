#!/usr/bin/env bash
# VibePlay object-storage backup (spec §34).
#
# Backs up published games plus the private avatars/media bucket (avatars,
# covers, and future first-party screenshots). Quarantine is optional.
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
MEDIA_BUCKET="${S3_AVATARS_BUCKET:-vibeplay-avatars}"
INCLUDE_QUARANTINE="${BACKUP_INCLUDE_QUARANTINE:-false}"
OUT="$BACKUP_DIR/storage"
BUCKETS=("$PUBLISHED_BUCKET" "$MEDIA_BUCKET")
if [ "$INCLUDE_QUARANTINE" = "true" ]; then BUCKETS+=("$QUARANTINE_BUCKET"); fi

if [ "${BACKUP_DRY_RUN:-false}" = "true" ]; then
  printf '[backup-storage] dry-run mode=%s destination=%s buckets=' "$MODE" "$OUT"
  printf '%s ' "${BUCKETS[@]}"
  printf '\n'
  exit 0
fi

mkdir -p "$OUT"

case "$MODE" in
  minio)
    # Reuses the official mc image on the private Compose network. MinIO never
    # needs a host-published port for backup access.
    : "${MINIO_ROOT_USER:?set MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD:?set MINIO_ROOT_PASSWORD}"
    MINIO_HOST="${MINIO_HOST:-http://minio:9000}"
    MINIO_DOCKER_NETWORK="${MINIO_DOCKER_NETWORK:-vibeplay_vibeplay}"
    export MINIO_HOST MINIO_ROOT_USER MINIO_ROOT_PASSWORD
    for bucket in "${BUCKETS[@]}"; do
      docker run --rm --network "$MINIO_DOCKER_NETWORK" --entrypoint /bin/sh \
        -e MINIO_HOST -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -e BUCKET="$bucket" \
        -v "$(cd "$OUT" && pwd)":/backup \
        minio/mc:latest -c 'mc alias set local "$MINIO_HOST" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --preserve "local/$BUCKET" "/backup/$BUCKET"'
    done
    ;;
  s3)
    : "${BACKUP_S3_DEST:?s3 mode requires BACKUP_S3_DEST (e.g. s3://vibeplay-backups)}"
    for bucket in "${BUCKETS[@]}"; do
      aws s3 sync "s3://$bucket" "$BACKUP_S3_DEST/$bucket" \
        ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
    done
    ;;
  fs)
    : "${FS_STORAGE_ROOT:?fs mode requires FS_STORAGE_ROOT}"
    for bucket in "${BUCKETS[@]}"; do
      mkdir -p "$OUT/$bucket"
      rsync -a --delete "$FS_STORAGE_ROOT/$bucket/" "$OUT/$bucket/"
    done
    ;;
  *)
    echo "unknown STORAGE_BACKUP_MODE: $MODE" >&2
    exit 1
    ;;
esac

echo "[backup-storage] done → $OUT"
