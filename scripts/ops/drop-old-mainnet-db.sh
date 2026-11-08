#!/usr/bin/env bash
# A week after the mainnet database moved (view 71), remove the unused old copy
# and its role from the shared testnet Postgres. Run on karwan-vm from ~/karwan:
#
#   scripts/ops/drop-old-mainnet-db.sh            checks only, changes nothing
#   scripts/ops/drop-old-mainnet-db.sh --drop     checks, then drops
#
# It refuses unless the mainnet API is connected to the new container, the
# old copy has had no connections, and the last nightly backup completed from
# the new container.
set -euo pipefail

KARWAN_DIR="${KARWAN_DIR:-$HOME/karwan}"
ENV_FILE="${ENV_FILE:-$KARWAN_DIR/.env.mainnet}"
OLD_PG="${OLD_PG:-karwan-postgres}"
OLD_USER="${OLD_USER:-karwan}"
NEW_PG="${NEW_PG:-karwan-postgres-mainnet}"
LOG="${BACKUP_LOG:-$KARWAN_DIR/logs/backup-mainnet.log}"
DB=karwan_mainnet

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "STOPPED: $*"; exit 1; }
old() { docker exec "$OLD_PG" psql -X -v ON_ERROR_STOP=1 -U "$OLD_USER" -d postgres -Atq "$@"; }

grep -qE "^DATABASE_URL=postgres(ql)?://[^@]+@postgres-mainnet:5432/$DB" "$ENV_FILE" || die ".env.mainnet does not point at postgres-mainnet"
[ "$(docker exec "$NEW_PG" psql -X -U postgres -d "$DB" -Atc "select count(*) from pg_stat_activity where datname = '$DB' and usename = '$DB'")" -gt 0 ] \
  || die "the mainnet API has no connection to $NEW_PG"
[ "$(old -c "select count(*) from pg_database where datname = '$DB'")" = 1 ] || die "$DB is already gone from $OLD_PG"
[ "$(old -c "select count(*) from pg_stat_activity where datname = '$DB'")" = 0 ] || die "something is still connected to the old copy"
last_done=$(grep -E ' done [0-9TZ]+$' "$LOG" | tail -1 || true)
last_start=$(grep -E ' start [0-9TZ]+ ' "$LOG" | tail -1 || true)
[ -n "$last_done" ] || die "no completed backup in $LOG"
[ "${last_done##* }" = "$(awk '{print $3}' <<<"$last_start")" ] || die "the latest backup run did not complete"
moved=$(ls "$ENV_FILE".before-move-* 2>/dev/null | sed -E 's/.*before-move-//' | sort | tail -1)
[ -n "$moved" ] || die "no .env.mainnet.before-move-* file, so the move time is unknown"
[[ "${last_done##* }" > "$moved" ]] || die "the last completed backup (${last_done##* }) is from before the move ($moved)"
log "checks passed: API on $NEW_PG, old copy idle, last backup ${last_done##* } complete"

if [ "${1:-}" != "--drop" ]; then
  log "nothing changed. Run again with --drop to remove $DB and its role from $OLD_PG"
  exit 0
fi
old -c "DROP DATABASE $DB"
old -c "DROP ROLE $DB"
log "dropped $DB and role $DB from $OLD_PG"
