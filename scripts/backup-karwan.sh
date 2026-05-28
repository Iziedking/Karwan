#!/usr/bin/env bash
# Snapshots ~/karwan/data/ + a pg_dump to a Cloudflare R2 bucket via rclone.
# Designed to run every 6 hours from cron. Keeps 28 days of history.
#
# Required: rclone configured with a remote named $KARWAN_BACKUP_REMOTE
# (default "karwan-r2") pointing at the bucket. Postgres dump is best-effort:
# skipped cleanly when pg_dump is missing or DATABASE_URL is unset.
#
# Optional: set KARWAN_BACKUP_HEARTBEAT_URL to a Better Stack / Healthchecks.io
# ping URL. The script GETs it on success so a missed run alerts you.
set -euo pipefail

REMOTE="${KARWAN_BACKUP_REMOTE:-karwan-r2}"
BUCKET="${KARWAN_BACKUP_BUCKET:-karwan-backups}"
KARWAN_HOME="${KARWAN_HOME:-$HOME/karwan}"
RETENTION_DAYS="${KARWAN_BACKUP_RETENTION_DAYS:-28}"

log() { echo "$(date -u +%FT%TZ) [karwan-backup] $*"; }

get_database_url() {
  if command -v docker >/dev/null 2>&1 \
     && docker ps --format '{{.Names}}' | grep -q '^karwan-api$'; then
    docker exec karwan-api printenv DATABASE_URL 2>/dev/null || true
  else
    echo "${DATABASE_URL:-}"
  fi
}

command -v rclone >/dev/null || { log "rclone not installed"; exit 1; }
[ -d "$KARWAN_HOME/data" ] || { log "no data/ at $KARWAN_HOME"; exit 1; }

ts=$(date -u +"%Y%m%dT%H%M%SZ")
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

data_tar="$tmpdir/karwan-data-${ts}.tar.gz"
tar -C "$KARWAN_HOME" -czf "$data_tar" data/
log "data snapshot $(du -h "$data_tar" | cut -f1)"

db_dump=""
db_url=$(get_database_url)
if [ -n "$db_url" ]; then
  if command -v pg_dump >/dev/null 2>&1; then
    db_dump="$tmpdir/karwan-db-${ts}.sql.gz"
    pg_dump --no-owner --no-privileges "$db_url" | gzip > "$db_dump"
    log "pg_dump $(du -h "$db_dump" | cut -f1)"
  else
    log "pg_dump missing on host; skipping DB snapshot"
  fi
else
  log "no DATABASE_URL on api container; skipping DB snapshot"
fi

rclone copy "$data_tar" "$REMOTE:$BUCKET/data/" --quiet
[ -n "$db_dump" ] && rclone copy "$db_dump" "$REMOTE:$BUCKET/db/" --quiet
log "uploaded to $REMOTE:$BUCKET"

rclone delete --min-age "${RETENTION_DAYS}d" "$REMOTE:$BUCKET/data/" --quiet || true
rclone delete --min-age "${RETENTION_DAYS}d" "$REMOTE:$BUCKET/db/" --quiet || true
log "pruned objects older than ${RETENTION_DAYS}d"

heartbeat="${KARWAN_BACKUP_HEARTBEAT_URL:-}"
if [ -n "$heartbeat" ]; then
  curl -fsS --max-time 10 --retry 3 "$heartbeat" >/dev/null \
    && log "heartbeat ok" \
    || log "heartbeat failed (non-fatal)"
fi
