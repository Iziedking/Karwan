#!/usr/bin/env bash
# Nightly encrypted backup of the Arc mainnet stack on the API host.
#
# Streams three artefacts through age straight into S3, so no plaintext copy
# ever lands on this disk:
#   db.dump.age              pg_dump -Fc of karwan_mainnet
#   env.mainnet.age          ~/karwan/.env.mainnet
#   data-mainnet.tar.gz.age  ~/karwan/data-mainnet/ (skipped until it exists)
#   MANIFEST                 written last, only when every upload succeeded
#
# A run without a MANIFEST is incomplete: pg_dump can die halfway and S3 will
# still accept the truncated stream. restore-test-mainnet.sh refuses such runs.
#
# Only age public keys live on this host. The private key stays offline, so
# neither this box nor its instance role can read a backup back.
#
#   BACKUP_BUCKET=<bucket> ~/karwan/backup/backup-mainnet.sh
#
# Cron (host crontab, UTC):
#   37 3 * * * BACKUP_BUCKET=<bucket> $HOME/karwan/backup/backup-mainnet.sh >> $HOME/karwan/logs/backup-mainnet.log 2>&1
set -euo pipefail
umask 077
export PATH=/snap/bin:/usr/local/bin:/usr/bin:/bin

KARWAN_DIR="${KARWAN_DIR:-$HOME/karwan}"
BUCKET="${BACKUP_BUCKET:?set BACKUP_BUCKET}"
PREFIX="${BACKUP_PREFIX:-mainnet}"
REGION="${BACKUP_REGION:-ca-central-1}"
RECIPIENTS="${AGE_RECIPIENTS:-$KARWAN_DIR/backup/age-recipients.txt}"
PG_CONTAINER="${PG_CONTAINER:-karwan-postgres}"
DB="${MAINNET_DB:-karwan_mainnet}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="s3://$BUCKET/$PREFIX/$STAMP"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
trap 'log "FAILED at line $LINENO, run $STAMP has no MANIFEST"' ERR

exec 9>"$KARWAN_DIR/backup/.lock"
flock -n 9 || { log "another backup is running"; exit 1; }

keys=$(grep -Ev '^\s*(#|$)' "$RECIPIENTS" || true)
[ -n "$keys" ] || { log "no age recipients in $RECIPIENTS"; exit 1; }
if grep -Evq '^age1[0-9a-z]{58}$' <<<"$keys"; then
  log "$RECIPIENTS holds something that is not an age public key"; exit 1
fi

put() { # $1 = object name, stdin = plaintext
  age -R "$RECIPIENTS" | aws s3 cp - "$DEST/$1" --region "$REGION" --only-show-errors
}

log "start $STAMP -> $DEST"

docker exec "$PG_CONTAINER" pg_dump -U karwan -d "$DB" -Fc -Z 6 | put db.dump.age
tables=$(docker exec "$PG_CONTAINER" psql -U karwan -d "$DB" -Atc \
  "select count(*) from information_schema.tables where table_schema = 'public'")
log "db.dump.age uploaded ($tables public tables)"

put env.mainnet.age < "$KARWAN_DIR/.env.mainnet"
log "env.mainnet.age uploaded"

objects="db.dump.age env.mainnet.age"
if [ -d "$KARWAN_DIR/data-mainnet" ]; then
  tar -C "$KARWAN_DIR" -czf - data-mainnet | put data-mainnet.tar.gz.age
  objects="$objects data-mainnet.tar.gz.age"
  log "data-mainnet.tar.gz.age uploaded"
else
  log "no data-mainnet/ yet, skipped"
fi

pg_version=$(docker exec "$PG_CONTAINER" pg_dump --version)
printf 'stamp=%s\nhost=%s\ndb=%s\npublic_tables=%s\npg_dump=%s\nobjects=%s\nrecipients=%s\n' \
  "$STAMP" "$(hostname)" "$DB" "$tables" "$pg_version" "$objects" "$(wc -l <<<"$keys")" \
  | aws s3 cp - "$DEST/MANIFEST" --region "$REGION" --only-show-errors

log "done $STAMP"
