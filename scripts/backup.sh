#!/usr/bin/env bash
# Backs up Postgres (full pg_dump, custom format) and MinIO (full bucket
# mirror) to a timestamped local directory. Safe to run against a live
# stack — pg_dump takes a consistent snapshot without blocking writers,
# and mc mirror only reads from the source.
#
# Usage: bash scripts/backup.sh [output-root-dir]   (default: ./backups)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

OUT_ROOT="${1:-./backups}"
TS=$(date +%Y%m%d-%H%M%S)
OUT="$OUT_ROOT/$TS"
mkdir -p "$OUT/minio"

if [ ! -f .env ]; then
  echo "No .env found at repo root — cannot read DB/MinIO credentials." >&2
  exit 1
fi
# -a auto-exports; strip a leading UTF-8 BOM first (some editors add one to
# .env, which otherwise breaks `source` with "command not found").
set -a; source <(sed '1s/^\xef\xbb\xbf//' .env); set +a

echo "=== Backing up Postgres -> $OUT/postgres.dump ==="
docker exec pubflow_postgres pg_dump -U pubflow -Fc pubflow > "$OUT/postgres.dump"
SIZE=$(du -h "$OUT/postgres.dump" | cut -f1)
echo "  done ($SIZE)"

echo "=== Backing up MinIO bucket '${MINIO_BUCKET:-pubflow-files}' -> $OUT/minio/ ==="
# MSYS_NO_PATHCONV: on Windows Git Bash, MSYS auto-mangles the -v host path
# (e.g. rewrites it against the Git install dir) unless this is set — the
# backup would silently "succeed" while writing nowhere retrievable.
MSYS_NO_PATHCONV=1 docker run --rm --network pubflow_data \
  -v "$(pwd)/$OUT/minio:/backup" \
  -e MC_HOST_src="http://${MINIO_ACCESS_KEY:-pubflow_minio}:${MINIO_SECRET_KEY:-pubflow_minio_secret}@minio:9000" \
  minio/mc:latest \
  mirror --quiet "src/${MINIO_BUCKET:-pubflow-files}" /backup
FILECOUNT=$(find "$OUT/minio" -type f | wc -l)
echo "  done ($FILECOUNT files)"

# Manifest so restore.sh (and a human) can sanity-check what a backup contains
{
  echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "postgres_dump_bytes=$(stat -c%s "$OUT/postgres.dump" 2>/dev/null || stat -f%z "$OUT/postgres.dump")"
  echo "minio_file_count=$FILECOUNT"
  echo "minio_bucket=${MINIO_BUCKET:-pubflow-files}"
} > "$OUT/manifest.txt"

echo
echo "=== Backup complete: $OUT ==="
cat "$OUT/manifest.txt"
