#!/usr/bin/env bash
# Restores Karwan flat files (and optionally a Postgres dump) from the
# Cloudflare R2 bucket on a fresh VPS. Run after provisioning the box,
# placing your .env, and before `docker compose up -d`.
#
# Skip the DB restore with KARWAN_RESTORE_SKIP_DB=1 when the Postgres host
# still has the data (the common case — the VPS dies, the managed DB lives).
set -euo pipefail

REMOTE="${KARWAN_BACKUP_REMOTE:-karwan-r2}"
BUCKET="${KARWAN_BACKUP_BUCKET:-karwan-backups}"
KARWAN_HOME="${KARWAN_HOME:-$HOME/karwan}"
SKIP_DB="${KARWAN_RESTORE_SKIP_DB:-0}"

log() { echo "$(date -u +%FT%TZ) [karwan-restore] $*"; }

command -v rclone >/dev/null || { log "rclone not installed"; exit 1; }

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

latest_data=$(rclone lsf "$REMOTE:$BUCKET/data/" | sort | tail -1 || true)
if [ -z "$latest_data" ]; then
  log "no data snapshots in $REMOTE:$BUCKET/data/"
  log "treating as cold start: leaving data/ empty so backend creates a fresh store"
else
  log "restoring $latest_data"
  rclone copy "$REMOTE:$BUCKET/data/$latest_data" "$tmpdir/"
  mkdir -p "$KARWAN_HOME"
  tar -C "$KARWAN_HOME" -xzf "$tmpdir/$latest_data"
  log "data/ restored to $KARWAN_HOME/data"
fi

if [ "$SKIP_DB" = "1" ]; then
  log "KARWAN_RESTORE_SKIP_DB=1; leaving Postgres alone"
  exit 0
fi

latest_db=$(rclone lsf "$REMOTE:$BUCKET/db/" | sort | tail -1 || true)
if [ -z "$latest_db" ]; then
  log "no DB snapshots in $REMOTE:$BUCKET/db/ (skipping)"
  exit 0
fi
db_url="${DATABASE_URL:-}"
if [ -z "$db_url" ]; then
  log "DATABASE_URL not exported. Source ~/karwan/.env or set KARWAN_RESTORE_SKIP_DB=1."
  exit 1
fi
rclone copy "$REMOTE:$BUCKET/db/$latest_db" "$tmpdir/"
log "about to apply $latest_db to $db_url"
log "Ctrl-C in the next 5 seconds to abort"
sleep 5
gunzip -c "$tmpdir/$latest_db" | psql "$db_url"
log "DB restored from $latest_db"
