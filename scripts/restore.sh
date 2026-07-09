#!/usr/bin/env bash
# Restores Postgres and MinIO from a backup produced by scripts/backup.sh.
#
# DESTRUCTIVE: replaces the current database contents and overlays the
# backed-up files onto the current bucket. Requires --force to actually run;
# without it, prints what it WOULD do and exits.
#
# Usage: bash scripts/restore.sh <backup-dir> [--force]
#   e.g. bash scripts/restore.sh ./backups/20260709-140000 --force
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BACKUP_DIR="${1:-}"
FORCE="${2:-}"

if [ -z "$BACKUP_DIR" ] || [ ! -f "$BACKUP_DIR/postgres.dump" ]; then
  echo "Usage: bash scripts/restore.sh <backup-dir> [--force]" >&2
  echo "  <backup-dir> must contain postgres.dump and minio/ (from scripts/backup.sh)" >&2
  exit 1
fi

echo "=== Backup manifest ==="
cat "$BACKUP_DIR/manifest.txt" 2>/dev/null || echo "(no manifest found)"
echo

if [ "$FORCE" != "--force" ]; then
  echo "DRY RUN — this would:"
  echo "  1. DROP and recreate the 'pubflow' Postgres database, then restore from $BACKUP_DIR/postgres.dump"
  echo "  2. Mirror $BACKUP_DIR/minio/ into the live MinIO bucket (overwrites files with the same key)"
  echo
  echo "Re-run with --force to actually execute this."
  exit 0
fi

if [ ! -f .env ]; then
  echo "No .env found at repo root — cannot read DB/MinIO credentials." >&2
  exit 1
fi
set -a; source <(sed '1s/^\xef\xbb\xbf//' .env); set +a

echo "=== Restoring Postgres from $BACKUP_DIR/postgres.dump ==="
docker exec pubflow_postgres psql -U pubflow -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'pubflow' AND pid <> pg_backend_pid();" > /dev/null
docker exec pubflow_postgres dropdb -U pubflow --if-exists pubflow
docker exec pubflow_postgres createdb -U pubflow pubflow
docker exec -i pubflow_postgres pg_restore -U pubflow -d pubflow --no-owner --no-privileges < "$BACKUP_DIR/postgres.dump"
echo "  done"

echo "=== Restoring MinIO bucket '${MINIO_BUCKET:-pubflow-files}' from $BACKUP_DIR/minio/ ==="
# See backup.sh for why MSYS_NO_PATHCONV is required on Windows Git Bash.
MSYS_NO_PATHCONV=1 docker run --rm --network pubflow_data \
  -v "$(pwd)/$BACKUP_DIR/minio:/backup" \
  -e MC_HOST_dst="http://${MINIO_ACCESS_KEY:-pubflow_minio}:${MINIO_SECRET_KEY:-pubflow_minio_secret}@minio:9000" \
  minio/mc:latest \
  mirror --quiet /backup "dst/${MINIO_BUCKET:-pubflow-files}"
echo "  done"

echo
echo "=== Restore complete ==="
echo "Restart the API/worker if they were running (they hold DB connections opened before the restore)."
