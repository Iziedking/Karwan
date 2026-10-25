#!/usr/bin/env bash
# The escrow-family path end to end against a fork of Arc Testnet taken at the
# latest block, so it runs on the live configured suite without touching it.
# Role keys come from the gitignored endgame.env and go over ssh stdin, never
# onto a command line or a screen. The fork is stopped when the run ends.
#   scripts/ops/suite-e2e.sh            parity, then the full run
#   scripts/ops/suite-e2e.sh parity     the read-only parity checks only
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/design/endgame-testnet-2026-10/endgame.env"
PHASE=${1:-full}
[ -f "$ENV_FILE" ] || { echo "suite-e2e: $ENV_FILE is missing" >&2; exit 1; }
export ARC_FORK_PORT=${ARC_FORK_PORT:-8558}
head=$(curl -s -X POST https://rpc.testnet.arc.io -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | sed -n 's/.*"result":"\(0x[0-9a-f]*\)".*/\1/p')
[ -n "$head" ] || { echo "suite-e2e: could not read the latest block" >&2; exit 1; }
export ARC_FORK_BLOCK=$(( head - 5 ))
trap '"$ROOT/scripts/ops/arc-fork.sh" down >/dev/null 2>&1 || true' EXIT
"$ROOT/scripts/ops/arc-fork.sh" down >/dev/null 2>&1 || true
"$ROOT/scripts/ops/arc-fork.sh" up >/dev/null
echo "suite-e2e: fork of Arc Testnet at block $ARC_FORK_BLOCK"
(
  set -a; . "$ENV_FILE"; set +a
  printf 'FORK_CHECKER_KEYS=%s,%s,%s\nFORK_ARBITER_KEY=%s\nFORK_ISSUER_KEY=%s\n' \
    "$ENDGAME_CHECKER1_KEY" "$ENDGAME_CHECKER2_KEY" "$ENDGAME_CHECKER3_KEY" "$ENDGAME_ARBITER_KEY" "$ENDGAME_ISSUER_KEY"
) | "$ROOT/scripts/ops/arc-fork.sh" e2e "$PHASE" 2>&1 | grep -E '^(suite fork e2e|PASS|FAIL|all checks|[0-9]+ check(s) failed)|Error'
