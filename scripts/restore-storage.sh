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

if [ ! -d "$SRC/$PUBLISHED_BUCKET" ]; then
  echo "[restore-storage] missing backup bucket: $SRC/$PUBLISHED_BUCKET" >&2
  exit 1
fi

case "$MODE" in
  fs)
    : "${FS_STORAGE_ROOT:?fs mode requires FS_STORAGE_ROOT}"
    mkdir -p "$FS_STORAGE_ROOT/$PUBLISHED_BUCKET"
    rsync -a "$SRC/$PUBLISHED_BUCKET/" "$FS_STORAGE_ROOT/$PUBLISHED_BUCKET/"
    ;;
  minio)
    : "${MINIO_ROOT_USER:?set MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD:?set MINIO_ROOT_PASSWORD}"
    MINIO_HOST="${MINIO_HOST:-http://localhost:9000}"
    docker run --rm --network host \
      -e MC_HOST_local="http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@${MINIO_HOST#http://}" \
      -v "$(cd "$SRC" && pwd)":/backup:ro \
      minio/mc:latest mirror --overwrite "/backup/$PUBLISHED_BUCKET" "local/$PUBLISHED_BUCKET"
    ;;
  s3)
    : "${RESTORE_S3_SOURCE:?s3 mode requires RESTORE_S3_SOURCE}"
    aws s3 sync "$RESTORE_S3_SOURCE/$PUBLISHED_BUCKET" "s3://$PUBLISHED_BUCKET" \
      ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
    ;;
  *)
    echo "unknown STORAGE_RESTORE_MODE: $MODE" >&2
    exit 1
    ;;
esac

echo "[restore-storage] restored $PUBLISHED_BUCKET from $SRC"
