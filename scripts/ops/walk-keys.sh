#!/usr/bin/env bash
# Copy the testnet secrets the signed-in walk needs from the testnet env on
# karwan-vm to ~/.karwan-walk/testnet.env on node-services, host to host, so no
# value reaches this terminal, a command line or a history: the Circle key and
# entity secret (the walk's own wallets) and the escrow family's checker,
# arbiter and issuer keys (without all three, new deals open on the old
# escrow). Refuses anything but a Circle TEST_API_KEY. Run it yourself:
#   bash scripts/ops/walk-keys.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC=karwan-vm
DST=node-services
FILE='~/.karwan-walk/testnet.env'

ssh -T -o BatchMode=yes $SRC 'grep -q "^CIRCLE_API_KEY=TEST_API_KEY:" ~/karwan/.env' < /dev/null \
  || { echo "walk-keys: the karwan-vm .env does not hold a Circle TEST key; nothing copied" >&2; exit 1; }

scp -q "$ROOT/scripts/ops/env-put.sh" $SRC:/tmp/env-put.sh
scp -q "$ROOT/scripts/ops/env-put.sh" $DST:/tmp/env-put.sh
trap 'ssh -T $SRC "rm -f /tmp/env-put.sh" < /dev/null || true; ssh -T $DST "rm -f /tmp/env-put.sh" < /dev/null || true' EXIT
ssh -T $DST 'mkdir -p ~/.karwan-walk && chmod 700 ~/.karwan-walk' < /dev/null

for name in CIRCLE_API_KEY CIRCLE_ENTITY_SECRET SUITE_CHECKER_KEYS SUITE_ARBITER_KEY SUITE_ISSUER_KEY; do
  ssh -T $SRC "bash /tmp/env-put.sh ~/karwan/.env $name --get" < /dev/null \
    | ssh -T $DST "bash /tmp/env-put.sh $FILE $name --stdin"
  ssh -T $DST "bash /tmp/env-put.sh $FILE $name --check" < /dev/null
done
