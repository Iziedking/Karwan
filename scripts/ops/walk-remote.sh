#!/usr/bin/env bash
# The walk stack on node-services (audit/TEST_BED_2026-11-05.md): its own
# Postgres, the backend in development mode and the frontend, against Arc
# Testnet, then the walk specs. Every run has its own directory, network and
# database, all removed at the end. Secrets stay on node-services: the env file
# is put together there from ~/.karwan-walk/testnet.env, never sent from here.
#   scripts/ops/walk-remote.sh                        stack check only
#   scripts/ops/walk-remote.sh e2e/walk/a1.spec.ts    stack check, then specs
#   OVERLAY="path ..." scripts/ops/walk-remote.sh ... the last commit plus only these working files
#   LOGS=dir scripts/ops/walk-remote.sh ...           copy the run's logs to dir
set -euo pipefail
H=node-services
IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NPM_CACHE=/tmp/karwan-npm-cache
SECRETS='~/.karwan-walk/testnet.env'

for p in "$@"; do
  case "$p" in *[!A-Za-z0-9_./:-]*|-*|*..*) echo "bad spec path: $p" >&2; exit 2 ;; esac
done

RUN=$(ssh -o BatchMode=yes $H 'd=$(mktemp -d /tmp/karwan-walk.XXXXXXXX); echo ${d##*.}' < /dev/null)
W=/tmp/karwan-walk.$RUN
NET=karwan-walk-$RUN
cleanup() {
  if [ -n "${LOGS:-}" ]; then
    mkdir -p "$LOGS"
    ssh -o BatchMode=yes $H "tar -C $W/repo -czf - walk-logs 2>/dev/null" < /dev/null | tar -C "$LOGS" -xzf - 2>/dev/null || true
  fi
  ssh -o BatchMode=yes $H "docker rm -f karwan-walk-app-$RUN karwan-walk-db-$RUN >/dev/null 2>&1; docker network rm $NET >/dev/null 2>&1; rm -rf $W" < /dev/null || true
}
trap cleanup EXIT

PARTS="package.json package-lock.json backend frontend cre/shared scripts"
if [ -n "${OVERLAY:-}" ]; then
  git -C "$ROOT" archive --format=tar HEAD $PARTS | ssh -o BatchMode=yes $H "mkdir -p $W/repo $NPM_CACHE && tar -C $W/repo -xf -"
  # shellcheck disable=SC2086
  tar -C "$ROOT" -czf - $OVERLAY | ssh -o BatchMode=yes $H "tar -C $W/repo -xzf -"
else
  # shellcheck disable=SC2086
  tar -C "$ROOT" -czf - --exclude=node_modules --exclude=dist --exclude=backend/data --exclude='*.log' \
    --exclude=.next --exclude=test-results --exclude=playwright-report $PARTS \
    | ssh -o BatchMode=yes $H "mkdir -p $W/repo $NPM_CACHE && tar -C $W/repo -xzf -"
fi

# The env: public settings, the secrets file, and values made for this run.
# Only names leave the secrets file in the clear, for the log check.
ssh -T -o BatchMode=yes $H "set -euo pipefail
  test -s $SECRETS || { echo 'walk: $SECRETS is missing; run scripts/ops/walk-keys.sh' >&2; exit 1; }
  grep -q '^CIRCLE_API_KEY=TEST_API_KEY:' $SECRETS || { echo 'walk: the Circle key is not a TEST key' >&2; exit 1; }
  umask 077; mkdir -p $W/run $W/out
  pg=\$(openssl rand -hex 16)
  { sed -e 's/\r\$//' $W/repo/scripts/ops/walk.public.env
    cat $SECRETS
    echo SESSION_SECRET=\$(openssl rand -hex 32)
    echo ADMIN_API_TOKEN=\$(openssl rand -hex 32)
    echo SUPPORT_API_TOKEN=\$(openssl rand -hex 32)
    echo RECORD_COUNTERPARTY_PEPPER=\$(openssl rand -hex 32)
    echo CHAT_NUMBER_PEPPER=\$(openssl rand -hex 32)
    echo POSTGRES_PASSWORD=\$pg
    echo DATABASE_URL=postgres://walk:\$pg@karwan-walk-db-$RUN:5432/walk
  } > $W/run/env
  { cut -d= -f1 $SECRETS; printf '%s\n' SESSION_SECRET ADMIN_API_TOKEN SUPPORT_API_TOKEN RECORD_COUNTERPARTY_PEPPER CHAT_NUMBER_PEPPER POSTGRES_PASSWORD; } > $W/run/secret-names
  docker network create $NET >/dev/null
  docker run -d --name karwan-walk-db-$RUN --network $NET -e POSTGRES_USER=walk -e POSTGRES_DB=walk \
    -e POSTGRES_PASSWORD=\$pg postgres:16-alpine >/dev/null
  for _ in \$(seq 1 30); do docker exec karwan-walk-db-$RUN pg_isready -U walk >/dev/null 2>&1 && break; sleep 1; done" < /dev/null

ssh -o BatchMode=yes $H "docker run --rm --name karwan-walk-app-$RUN --network $NET --cpus=6 --memory=10g --ipc=host \
  --user \$(id -u):\$(id -g) -e HOME=/tmp -e CI=1 -e npm_config_cache=/npm-cache -v $NPM_CACHE:/npm-cache \
  -v $W/repo:/repo -v $W/run:/run/walk:ro -v $W/out:/run/walk-out -w /repo \
  --entrypoint bash $IMAGE scripts/ops/walk-inside.sh $*" < /dev/null && STATUS=0 || STATUS=$?

# Wallet sets made by this run are kept with the walk secrets for the next one.
ssh -T -o BatchMode=yes $H "if [ -s $W/out/sets ]; then grep -E '^CIRCLE_(PAYLINK_)?WALLET_SET_ID=[0-9a-f-]+\$' $W/out/sets >> $SECRETS; echo 'walk: kept the new wallet set ids'; fi" < /dev/null
[ $STATUS -eq 0 ] && echo "walk: all passed"
exit $STATUS
