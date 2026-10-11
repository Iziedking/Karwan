#!/usr/bin/env bash
# Publish the source of every contract one deploy created, on Sourcify, on the
# day it is deployed. Verified means the source is public and matches the
# bytecode; it is not an audit.
#
#   script/mainnet/verify-sources.sh broadcast/DeploySuite.s.sol/5042/run-latest.json
#
# Run it from the machine that ran the deploy: the broadcast file is not in git.
# Constructor arguments are read from each creation transaction and external
# libraries (DealTermsLib, DealDisputeLib, DealDeliveryLib) from the same file,
# so nothing is typed by hand.
#
# Env:
#   CHAIN   5042 (Arc mainnet, default) or 5042002 (Arc testnet)
#   DRY=1   build each verification input and stop; nothing is submitted
set -euo pipefail
cd "$(dirname "$0")/../.."

RUN="${1:?usage: script/mainnet/verify-sources.sh <broadcast run json>}"
CHAIN="${CHAIN:-5042}"
case "$CHAIN" in 5042|5042002) ;; *) echo "STOP: CHAIN must be 5042 or 5042002" >&2; exit 1 ;; esac
[ -f "$RUN" ] || { echo "STOP: no broadcast file at $RUN" >&2; exit 1; }

# One line per contract the run created: name, address, creation input.
creations=$(python -c "
import json, sys
run = json.load(open(sys.argv[1]))
for t in run['transactions']:
    if t.get('transactionType') in ('CREATE', 'CREATE2') and t.get('contractName'):
        print(t['contractName'], t['contractAddress'], t['transaction']['input'])
" "$RUN")
libraries=$(python -c "
import json, sys
print(' '.join(json.load(open(sys.argv[1])).get('libraries', [])))
" "$RUN")

[ -n "$creations" ] || { echo "STOP: the run created no contracts" >&2; exit 1; }

failed=0
while read -r name address input; do
  source=$(grep -rlE "^(abstract )?(contract|library) ${name}\b" src | head -1)
  [ -n "$source" ] || { echo "SKIP $name $address: no source in src/"; failed=1; continue; }
  bytecode=$(forge inspect "$source:$name" bytecode)
  args=()
  ctor="0x${input:${#bytecode}}"
  [ "$ctor" != "0x" ] && args+=(--constructor-args "$ctor")
  if [[ "$bytecode" == *'__$'* ]]; then
    for lib in $libraries; do args+=(--libraries "$lib"); done
  fi
  echo "== $name $address"
  if [ "${DRY:-}" = 1 ]; then
    forge verify-contract "$address" "$source:$name" --chain-id "$CHAIN" --verifier sourcify "${args[@]}" \
      --show-standard-json-input > /dev/null && echo "ready (dry run, nothing submitted)" || failed=1
  else
    forge verify-contract "$address" "$source:$name" --chain-id "$CHAIN" --verifier sourcify "${args[@]}" --watch || failed=1
  fi
done <<< "$creations"

[ "$failed" = 0 ] && echo "OK: every contract in $RUN is handled" || { echo "STOP: at least one contract was not verified" >&2; exit 1; }
