#!/usr/bin/env bash
# Prove a mainnet backup restores, on a machine that holds the age private key.
#
# Downloads one run's ciphertext, then restores the database into a throwaway
# postgres:17-alpine container (no published port) and reports what came back.
# The env file and data archive are only hashed and listed, never written out
# in plaintext. Everything it creates is removed on exit.
#
#   AWS_PROFILE=karwan BACKUP_BUCKET=<bucket> \
#     scripts/restore-test-mainnet.sh <identity-file> [stamp]
#
# stamp defaults to the newest run that has a MANIFEST. Compare the printed
# env sha256 with `sha256sum ~/karwan/.env.mainnet` on the server.
#
# Real disaster restore, same inputs, on the rebuilt host:
#   age -d -i KEY env.mainnet.age > ~/karwan/.env.mainnet  (then chmod 640)
#   age -d -i KEY data-mainnet.tar.gz.age | tar -C ~/karwan -xzf -
#   age -d -i KEY db.dump.age | docker exec -i karwan-postgres \
#     pg_restore -U karwan -d karwan_mainnet --no-owner --role=karwan_mainnet --exit-on-error
set -euo pipefail

IDENTITY="${1:?usage: restore-test-mainnet.sh <identity-file> [stamp]}"
STAMP="${2:-}"
BUCKET="${BACKUP_BUCKET:?set BACKUP_BUCKET}"
PREFIX="${BACKUP_PREFIX:-mainnet}"
REGION="${BACKUP_REGION:-ca-central-1}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
CONTAINER="karwan-restore-test-$$"

work=$(mktemp -d)
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

if [ -z "$STAMP" ]; then
  # shellcheck disable=SC2016  # backticks are JMESPath literals
  STAMP=$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX/" --region "$REGION" \
    --query 'Contents[?ends_with(Key, `/MANIFEST`)].Key' --output text \
    | tr '\t' '\n' | sort | tail -1 | cut -d/ -f2)
fi
[ -n "$STAMP" ] || { echo "no complete run under s3://$BUCKET/$PREFIX/"; exit 1; }

src="s3://$BUCKET/$PREFIX/$STAMP"
aws s3 cp "$src/MANIFEST" "$work/MANIFEST" --region "$REGION" --only-show-errors \
  || { echo "$STAMP has no MANIFEST, the run did not finish"; exit 1; }
echo "== run $STAMP"
cat "$work/MANIFEST"
objects=$(sed -n 's/^objects=//p' "$work/MANIFEST")
expected_tables=$(sed -n 's/^public_tables=//p' "$work/MANIFEST")
for o in $objects; do
  aws s3 cp "$src/$o" "$work/$o" --region "$REGION" --only-show-errors
done

echo "== env.mainnet"
age -d -i "$IDENTITY" "$work/env.mainnet.age" | sha256sum | cut -d' ' -f1 | sed 's/^/sha256 /'
age -d -i "$IDENTITY" "$work/env.mainnet.age" | grep -Eo '^[A-Z0-9_]+=' | tr -d '=' | sort | paste -sd' ' -

if [ -f "$work/data-mainnet.tar.gz.age" ]; then
  echo "== data-mainnet"
  age -d -i "$IDENTITY" "$work/data-mainnet.tar.gz.age" | tar -tzvf -
fi

echo "== database"
docker run -d --name "$CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=karwan_mainnet "$PG_IMAGE" >/dev/null
for _ in $(seq 60); do
  docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d karwan_mainnet -q 2>/dev/null && break
  sleep 1
done
age -d -i "$IDENTITY" "$work/db.dump.age" \
  | docker exec -i "$CONTAINER" pg_restore -h 127.0.0.1 -U postgres -d karwan_mainnet --no-owner --no-acl --exit-on-error
restored_tables=$(docker exec "$CONTAINER" psql -U postgres -d karwan_mainnet -Atc \
  "select count(*) from information_schema.tables where table_schema = 'public'")
echo "public tables: restored $restored_tables, manifest $expected_tables"
docker exec "$CONTAINER" psql -U postgres -d karwan_mainnet -Atc \
  "select 'canary=' || v from backup_canary" 2>/dev/null || true
[ "$restored_tables" = "$expected_tables" ] || { echo "RESTORE MISMATCH"; exit 1; }
echo "RESTORE OK"
