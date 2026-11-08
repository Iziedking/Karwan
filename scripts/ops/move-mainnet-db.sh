#!/usr/bin/env bash
# Move the Arc mainnet database out of the shared testnet Postgres into its own
# container (view 71). Run on karwan-vm from ~/karwan, with the new container
# up and the mainnet API stopped:
#
#   docker compose --profile mainnet up -d postgres-mainnet
#   docker compose --profile mainnet stop karwan-api-mainnet
#   scripts/ops/move-mainnet-db.sh        (the copy in ~/karwan/backup/)
#
# It creates the karwan_mainnet role and database in the new container with
# the password already in .env.mainnet (read here, never printed), copies the
# data with pg_dump into pg_restore, checks every table's row count against
# the old copy, and only then points .env.mainnet at the new host. The old
# database is not touched, so going back is restoring .env.mainnet from the
# dated copy this writes and restarting the API.
set -euo pipefail
umask 077

KARWAN_DIR="${KARWAN_DIR:-$HOME/karwan}"
ENV_FILE="${ENV_FILE:-$KARWAN_DIR/.env.mainnet}"
OLD_PG="${OLD_PG:-karwan-postgres}"
OLD_USER="${OLD_USER:-karwan}"
NEW_PG="${NEW_PG:-karwan-postgres-mainnet}"
NEW_HOST="${NEW_HOST:-postgres-mainnet}"
API="${API_CONTAINER:-karwan-api-mainnet}"
DB=karwan_mainnet
ROLE=karwan_mainnet

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "STOPPED: $*"; exit 1; }
started=$(date +%s)

old() { docker exec "$OLD_PG" psql -X -v ON_ERROR_STOP=1 -U "$OLD_USER" -d "$DB" -Atq "$@"; }
new_admin() { docker exec "$NEW_PG" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq "$@"; }
new_admin_stdin() { docker exec -i "$NEW_PG" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq; }
new_db() { docker exec "$NEW_PG" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" -Atq "$@"; }

# 1. Preflight. Nothing is written until all of these hold.
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found"
url_line=$(grep -E '^DATABASE_URL=' "$ENV_FILE" || true)
[ "$(grep -cE '^DATABASE_URL=' "$ENV_FILE")" = 1 ] || die "expected exactly one DATABASE_URL in $ENV_FILE"
pw=$(sed -E 's#^DATABASE_URL=postgres(ql)?://[^:]+:([^@]+)@.*#\2#' <<<"$url_line")
[[ "$pw" =~ ^[A-Za-z0-9]{24,}$ ]] || die "the DATABASE_URL password is not the plain letters-and-digits form this script expects"
grep -qE "@postgres:5432/$DB(\?|$)" <<<"$url_line" || die "DATABASE_URL does not point at postgres:5432/$DB (already moved?)"

[ "$(docker inspect -f '{{.State.Health.Status}}' "$NEW_PG" 2>/dev/null)" = healthy ] || die "$NEW_PG is not running and healthy"
[ "$(docker inspect -f '{{.State.Running}}' "$API" 2>/dev/null || echo false)" = false ] || die "$API is running; stop it first so nothing is written mid-copy"
[ "$(new_admin -c "select count(*) from pg_roles where rolname = '$ROLE'")" = 0 ] || die "role $ROLE already exists in $NEW_PG"
[ "$(new_admin -c "select count(*) from pg_database where datname = '$DB'")" = 0 ] || die "database $DB already exists in $NEW_PG"
old -c 'select 1' >/dev/null || die "cannot read $DB in $OLD_PG"
log "preflight passed"

# 2. Role and database. The password goes in on stdin, never on a command line.
printf "CREATE ROLE %s LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '%s';\n" "$ROLE" "$pw" | new_admin_stdin >/dev/null
unset pw
new_admin -c "CREATE DATABASE $DB OWNER $ROLE" >/dev/null
new_admin -c "REVOKE CONNECT ON DATABASE $DB FROM PUBLIC; REVOKE CONNECT ON DATABASE postgres FROM PUBLIC" >/dev/null
new_db -c "ALTER SCHEMA public OWNER TO $ROLE" >/dev/null
log "role and database created"

# 3. Copy.
docker exec "$OLD_PG" pg_dump -U "$OLD_USER" -d "$DB" -Fc -Z 6 \
  | docker exec -i "$NEW_PG" pg_restore -U postgres -d "$DB" --no-owner --role="$ROLE" --exit-on-error
log "data copied"

# 4. Every table, every row count, old against new.
count_sql="select string_agg(format('%s %s', t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text), E'\n' order by t)
  from (select tablename as t from pg_tables where schemaname = 'public') x"
old_counts=$(old -c "$count_sql")
new_counts=$(new_db -c "$count_sql")
tables=$(wc -l <<<"$old_counts")
if [ "$old_counts" != "$new_counts" ]; then
  diff <(echo "$old_counts") <(echo "$new_counts") || true
  die "row counts differ; .env.mainnet was not changed"
fi
owners=$(new_db -c "select string_agg(distinct pg_get_userbyid(relowner), ',') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'")
[ "$owners" = "$ROLE" ] || die "objects owned by '$owners', expected only $ROLE; .env.mainnet was not changed"
log "all $tables tables match, all owned by $ROLE"

# 5. Point the API at the new host, keeping a dated copy to go back with.
backup="$ENV_FILE.before-move-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$ENV_FILE" "$backup"
sed -i -E "s#^(DATABASE_URL=postgres(ql)?://[^@]+@)postgres:5432/#\1$NEW_HOST:5432/#" "$ENV_FILE"
grep -qE "^DATABASE_URL=postgres(ql)?://[^@]+@$NEW_HOST:5432/$DB" "$ENV_FILE" || { cp -p "$backup" "$ENV_FILE"; die "could not rewrite DATABASE_URL; restored the original"; }
log "DATABASE_URL now points at $NEW_HOST (previous file kept as $(basename "$backup"))"

log "done in $(( $(date +%s) - started ))s. Next: KARWAN_API_TAG=\$(cat .deployed-tag) docker compose --profile mainnet up -d karwan-api-mainnet"
