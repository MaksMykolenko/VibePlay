#!/usr/bin/env bash
# Restore a backup produced by scripts/backup-storage.sh.
#
#   ./scripts/restore-storage.sh <backup-storage-directory>
#
# The target is selected by STORAGE_RESTORE_MODE (fs|minio|s3). Existing
# objects with the same immutable key are overwritten; unrelated keys are not
# deleted automatically.
set -euo pipefail

SRC="${1:?usage: restore-storage.sh <backup-storage-directory>}"
MODE="${STORAGE_RESTORE_MODE:-fs}"
PUBLISHED_BUCKET="${S3_PUBLISHED_BUCKET:-vibeplay-published}"
QUARANTINE_BUCKET="${S3_QUARANTINE_BUCKET:-vibeplay-quarantine}"
MEDIA_BUCKET="${S3_AVATARS_BUCKET:-vibeplay-avatars}"
BUCKETS=("$PUBLISHED_BUCKET" "$MEDIA_BUCKET")
if [ -d "$SRC/$QUARANTINE_BUCKET" ]; then BUCKETS+=("$QUARANTINE_BUCKET"); fi

for bucket in "$PUBLISHED_BUCKET" "$MEDIA_BUCKET"; do
  if [ ! -d "$SRC/$bucket" ]; then
    echo "[restore-storage] missing required backup bucket: $SRC/$bucket" >&2
    exit 1
  fi
done

if [ "${RESTORE_DRY_RUN:-false}" = "true" ]; then
  printf '[restore-storage] dry-run mode=%s source=%s buckets=' "$MODE" "$SRC"
  printf '%s ' "${BUCKETS[@]}"
  printf '\n'
  exit 0
fi

case "$MODE" in
  fs)
    : "${FS_STORAGE_ROOT:?fs mode requires FS_STORAGE_ROOT}"
    for bucket in "${BUCKETS[@]}"; do
      mkdir -p "$FS_STORAGE_ROOT/$bucket"
      rsync -a "$SRC/$bucket/" "$FS_STORAGE_ROOT/$bucket/"
    done
    ;;
  minio)
    : "${MINIO_ROOT_USER:?set MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD:?set MINIO_ROOT_PASSWORD}"
    MINIO_HOST="${MINIO_HOST:-http://minio:9000}"
    MINIO_DOCKER_NETWORK="${MINIO_DOCKER_NETWORK:-vibeplay_vibeplay}"
    export MINIO_HOST MINIO_ROOT_USER MINIO_ROOT_PASSWORD
    for bucket in "${BUCKETS[@]}"; do
      docker run --rm --network "$MINIO_DOCKER_NETWORK" --entrypoint /bin/sh \
        -e MINIO_HOST -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -e BUCKET="$bucket" \
        -v "$(cd "$SRC" && pwd)":/backup:ro \
        minio/mc:latest -c 'mc alias set local "$MINIO_HOST" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite "/backup/$BUCKET" "local/$BUCKET"'
    done
    ;;
  s3)
    : "${RESTORE_S3_SOURCE:?s3 mode requires RESTORE_S3_SOURCE}"
    for bucket in "${BUCKETS[@]}"; do
      aws s3 sync "$RESTORE_S3_SOURCE/$bucket" "s3://$bucket" \
        ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
    done
    ;;
  *)
    echo "unknown STORAGE_RESTORE_MODE: $MODE" >&2
    exit 1
    ;;
esac

echo "[restore-storage] restored private buckets from $SRC; verify no anonymous/public policies"
