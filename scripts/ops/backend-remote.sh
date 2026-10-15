#!/usr/bin/env bash
# Backend gates on node-services, never on the laptop. Mirrors CI: Node 20,
# npm ci, a disposable Postgres for the *.postgres tests. Every run gets its
# own workspace and its own database, removed when the run ends, so two
# sessions running gates at once never touch each other's files.
#   scripts/ops/backend-remote.sh typecheck
#   scripts/ops/backend-remote.sh test            full backend suite with Postgres
#   scripts/ops/backend-remote.sh test src/cre    one folder
set -euo pipefail
H=node-services
NODE_IMAGE=node:20-bookworm
PG_IMAGE=postgres:16-alpine
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NPM_CACHE=/tmp/karwan-npm-cache

case "${1:-}" in
  typecheck) CMD="npm --prefix backend run typecheck" ;;
  test) CMD="cd backend && node ../scripts/run-tests.mjs ${2:-src} --concurrency=4" ;;
  *) echo "usage: $0 typecheck | test [path]" >&2; exit 2 ;;
esac

RUN=$(ssh -o BatchMode=yes $H 'd=$(mktemp -d /tmp/karwan-backend.XXXXXXXX); echo ${d##*.}' < /dev/null)
W=/tmp/karwan-backend.$RUN
PG=karwan-backend-pg-$RUN
cleanup() {
  ssh -o BatchMode=yes $H "docker rm -f karwan-backend-run-$RUN $PG >/dev/null 2>&1; rm -rf $W" < /dev/null || true
}
trap cleanup EXIT

# The backend's guide and release-notes tests read frontend pages, docs, README.md and RELEASE_NOTES.md.
tar -C "$ROOT" -czf - --exclude=node_modules --exclude=dist --exclude=backend/data --exclude='*.log' \
  --exclude=.next --exclude=test-results --exclude=playwright-report \
  package.json package-lock.json README.md RELEASE_NOTES.md docs backend frontend cre/shared scripts \
  | ssh -o BatchMode=yes $H "mkdir -p $W/repo $NPM_CACHE && tar -C $W/repo -xzf -"

ssh -o BatchMode=yes $H "docker run -d --rm --name $PG -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=karwan_test $PG_IMAGE >/dev/null
  for i in \$(seq 30); do docker exec $PG pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done" < /dev/null

# Runs as the host user, so the workspace never holds root-owned files, and
# shares the database container's network so the tests see it on 127.0.0.1.
ssh -o BatchMode=yes $H "docker run --rm --name karwan-backend-run-$RUN --network container:$PG --cpus=8 --memory=8g \
  --user \$(id -u):\$(id -g) -e HOME=/tmp -e npm_config_cache=/npm-cache -v $NPM_CACHE:/npm-cache -v $W/repo:/repo -w /repo \
  -e TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/karwan_test \
  -e KARWAN_JOBBOARD_ADDR=0x0000000000000000000000000000000000000001 \
  -e KARWAN_ESCROW_ADDR=0x0000000000000000000000000000000000000002 \
  -e KARWAN_REPUTATION_ADDR=0x0000000000000000000000000000000000000003 \
  -e KARWAN_VAULT_ADDR=0x0000000000000000000000000000000000000004 \
  -e IDENTITY_REGISTRY_ADDR=0x0000000000000000000000000000000000000005 \
  -e USDC_ADDR=0x0000000000000000000000000000000000000006 \
  -e AGENT_RUNTIME_V2_ENABLED=0 -e MATCH_ENGINE_V2_SHADOW=0 -e NEGOTIATION_V2_SHADOW=0 \
  -e NEGOTIATION_V2_ENABLED=0 -e FINANCIAL_COMMANDS_V2_ENABLED=0 -e EVENT_OUTBOX_V2_ENABLED=0 \
  --entrypoint sh $NODE_IMAGE -c $(printf '%q' "npm ci --no-audit --no-fund --workspace=backend --include-workspace-root >/dev/null && $CMD")" < /dev/null
