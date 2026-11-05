#!/usr/bin/env bash
# Runs inside the walk container (scripts/ops/walk-remote.sh). Builds the
# backend and frontend, starts them against Arc Testnet with the stack's own
# Postgres, checks the stack is sound, then runs the walk specs given.
set -euo pipefail
cd /repo
set -a
. /run/walk/env
set +a
LOGS=/repo/walk-logs
mkdir -p "$LOGS"

npm ci --no-audit --no-fund >/dev/null
npm run build --workspace=backend >/dev/null

if [ -z "${CIRCLE_WALLET_SET_ID:-}" ] || [ -z "${CIRCLE_PAYLINK_WALLET_SET_ID:-}" ]; then
  (cd backend && node dist/scripts/walk-wallet-sets.js) > /run/walk-out/sets
  set -a
  . /run/walk-out/sets
  set +a
  echo "walk: made the walk's wallet sets: $(cut -d= -f1 /run/walk-out/sets | tr '\n' ' ')"
fi

if [ "${1:-}" = bank ]; then
  if [ -z "${CIRCLE_WALK_BANK_WALLET_ID:-}" ]; then
    (cd backend && node dist/scripts/walk-bank.js) > /run/walk-out/bank
    set -a
    . /run/walk-out/bank
    set +a
    echo "walk: made the bank wallet $CIRCLE_WALK_BANK_ADDRESS"
  fi
  [ "${2:-}" = drip ] && (cd backend && node dist/scripts/walk-bank.js drip)
  exit 0
fi

(cd backend && node dist/index.js >"$LOGS/backend.log" 2>&1) &
BACKEND=$!

NODE_ENV=production NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8787 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
  NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.io NEXT_PUBLIC_MONEY_V2=1 NEXT_PUBLIC_SME_TRADES_ENABLED=1 NEXT_PUBLIC_PAYTAG_ENABLED=1 \
  npm run build --workspace=frontend >"$LOGS/frontend-build.log" 2>&1 \
  || { echo "walk: the frontend build failed; last lines:" >&2; tail -n 30 "$LOGS/frontend-build.log" >&2; exit 1; }
(cd frontend && NODE_ENV=production npx next start -p 3000 -H 127.0.0.1 >"$LOGS/frontend.log" 2>&1) &

up=0
for _ in $(seq 1 90); do
  if curl -sf http://127.0.0.1:8787/health >/dev/null && curl -sf -o /dev/null http://127.0.0.1:3000/; then up=1; break; fi
  kill -0 $BACKEND 2>/dev/null || break
  sleep 2
done
if [ $up -ne 1 ]; then
  echo "walk: the stack did not come up; last backend lines:" >&2
  tail -n 40 "$LOGS/backend.log" >&2
  exit 1
fi

problems=0
grep -q 'suite boot check passed' "$LOGS/backend.log" \
  || { echo "walk: suite boot check did not pass, so new deals would open on the old escrow" >&2; grep -m3 'suite boot check' "$LOGS/backend.log" >&2 || true; problems=1; }
while IFS= read -r name; do
  value="${!name:-}"
  [ ${#value} -ge 8 ] || continue
  if grep -rqF -- "$value" "$LOGS"; then echo "walk: the value of $name appears in a log" >&2; problems=1; fi
done < /run/walk/secret-names
[ $problems -eq 0 ] || exit 1
echo "walk: stack up, suite check passed, no secret in the logs"

if [ $# -gt 0 ]; then
  cd frontend
  WALK_BACKEND=http://127.0.0.1:8787 WALK_FRONTEND=http://127.0.0.1:3000 \
    npx playwright test --config=playwright.walk.config.ts --reporter=line "$@"
fi
