#!/usr/bin/env bash
# disable-legacy.sh — close the 30-day legacy recovery surface.
#
# Run this on the VPS on or after 2026-06-26. It does three things:
#   1. Comments out KARWAN_ESCROW_LEGACY_ADDR, KARWAN_VAULT_LEGACY_ADDR, and
#      LEGACY_WINDOW_CLOSES_AT in ~/karwan/.env.
#   2. Backs up the .env to .env.before-legacy-close just in case.
#   3. Restarts the karwan-api container so the live process reads the new env.
#
# After this runs:
#   - GET /api/legacy/window returns { open: false }
#   - Home banner stops rendering
#   - /legacy page shows the "Closed" state
#   - /api/legacy/* writes return 410 Gone
#   - Reading reputation still sums legacy vault tenure if the address is set;
#     unsetting kills that path cleanly
#
# No on-chain state changes. Anyone with funds still on the legacy contracts
# can interact with them directly via Etherscan / Foundry after this date.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/home/karwan/karwan/.env}"
COMPOSE_DIR="${COMPOSE_DIR:-/home/karwan/karwan}"
SERVICE="${SERVICE:-karwan-api}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Set ENV_FILE=... if your .env lives elsewhere."
  exit 1
fi

cp "$ENV_FILE" "$ENV_FILE.before-legacy-close.$(date +%Y%m%d-%H%M%S)"
echo "Backed up .env."

# Comment out (don't delete) so the values stay readable if you ever need
# them for forensics. sed in-place; -i.bak on macOS, -i on GNU. Try both.
sed_inplace() {
  sed -i.bak "$@" "$ENV_FILE" 2>/dev/null || sed -i "$@" "$ENV_FILE"
}

sed_inplace -E 's/^(KARWAN_ESCROW_LEGACY_ADDR=.+)$/# \1  # disabled by disable-legacy.sh/'
sed_inplace -E 's/^(KARWAN_VAULT_LEGACY_ADDR=.+)$/# \1  # disabled by disable-legacy.sh/'
sed_inplace -E 's/^(LEGACY_WINDOW_CLOSES_AT=.+)$/# \1  # disabled by disable-legacy.sh/'
rm -f "$ENV_FILE.bak" 2>/dev/null || true

echo "Commented out legacy env vars."

cd "$COMPOSE_DIR"
docker compose up -d --no-deps --force-recreate "$SERVICE"
echo "Restarted $SERVICE."

echo
echo "Verifying window is closed:"
sleep 4
curl -sf "http://127.0.0.1:8787/api/legacy/window" || echo "(could not reach local api; check public health endpoint instead)"
echo
echo "Done."
